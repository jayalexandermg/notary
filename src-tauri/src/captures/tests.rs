use super::*;
use std::path::PathBuf;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        Self(std::env::temp_dir().join(format!("hoverthought-captures-{}", Uuid::new_v4())))
    }
    fn open(&self) -> Database { Database::new(self.0.clone()).unwrap() }
}
impl Drop for Fixture {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

#[test]
fn phase5_workspace_lifecycle_stress_preserves_independent_records() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let project = db.create_project("Workspace").unwrap();
    let nested = db.create_project_in("Nested", Some(&project.id)).unwrap();
    let mut records: Vec<_> = ["A", "B", "C"].iter().map(|s| db.create_project_note(s, None, &nested.id).unwrap()).collect();
    let mut views: Vec<_> = records.iter().map(|r| db.get_presentation(&r.id).unwrap()).collect();
    for cycle in 0..30 {
        let index = cycle % 3;
        let original = records[index].clone();
        views[index].pos_x = 100.0 + cycle as f64;
        views[index].width = 330.0 + cycle as f64;
        views[index].height = 222.0 + cycle as f64;
        views[index].opacity = if cycle % 2 == 0 { 0.5 } else { 0.9 };
        views[index].always_on_top = cycle % 2 == 0;
        views[index].is_open = cycle % 2 != 0;
        db.save_presentation(&views[index]).unwrap();
        assert_eq!(db.get_capture(&original.id).unwrap(), original);
        let title = match cycle % 3 { 0 => Some("Added"), 1 => Some("Changed"), _ => None };
        let edited = db.edit_capture_text(&original.id, &format!("Edited {cycle}\nkeep trailing  "), title).unwrap();
        assert_eq!(edited.id, original.id);
        assert_eq!(edited.created_at, original.created_at);
        assert!(edited.updated_at > original.updated_at);
        let mut prior = edited.clone();
        for transition in 0..6 {
            let deleted = transition % 2 == 0;
            let current = if deleted { db.soft_delete_capture(&prior.id) } else { db.restore_capture(&prior.id) }.unwrap();
            assert!(current.lifecycle_at > prior.lifecycle_at);
            assert_eq!(current.updated_at, edited.updated_at);
            assert_eq!(current.id, original.id);
            assert_eq!(current.created_at, original.created_at);
            assert_eq!(current.container_id, original.container_id);
            assert_eq!(db.get_capture(&prior.id).is_err(), deleted);
            assert_eq!(db.list_captures(&nested.id).unwrap().iter().any(|r| r.id == prior.id), !deleted);
            prior = current;
        }
        records[index] = prior;
        for (n, record) in records.iter().enumerate() {
            assert_eq!(db.get_capture(&record.id).unwrap(), *record);
            if n != index && db.has_capture_presentation(&record.id).unwrap() { assert_eq!(db.get_presentation(&record.id).unwrap(), views[n]); }
        }
    }
    drop(db);
    let db = fixture.open();
    for (record, view) in records.iter().zip(views) {
        assert_eq!(db.get_capture(&record.id).unwrap(), *record);
        assert_eq!(db.get_presentation(&record.id).unwrap(), view);
    }
    assert!(db.list_deleted_captures().unwrap().is_empty());
}

#[test]
fn phase5_capture_bursts_fail_atomically_and_survive_reopen() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let primary = db.create_project("Burst primary").unwrap();
    let nested = db.create_project_in("Nested", Some(&primary.id)).unwrap();
    let mut expected = Vec::new();
    for burst in 0..5 {
        db.set_primary_project(if burst % 2 == 0 { Some(&primary.id) } else { None }).unwrap();
        for n in 0..20 {
            let content = format!("Burst {burst}/{n} — café\nexact trailing spaces  ");
            let title = if n % 2 == 0 { Some("Explicit title") } else { None };
            let destination = if n % 3 == 0 { Some(nested.id.as_str()) } else { None };
            let record = db.create_quick_capture(&content, title, destination).unwrap();
            assert_eq!(Uuid::parse_str(&record.id).unwrap().get_version_num(), 7);
            assert_eq!(record.content, content);
            assert_eq!(record.title.as_deref(), title);
            assert_eq!(record.schema_version, "1.1");
            assert_eq!(record.source, "hoverthought/quick-capture");
            assert_eq!(record.created_at, record.updated_at);
            assert_eq!(record.created_at, record.lifecycle_at);
            assert_eq!(record.deleted_at, None);
            assert_eq!(record.container_id, destination.unwrap_or(if burst % 2 == 0 { &primary.id } else { WAITING_ROOM }));
            expected.push(record);
        }
        assert!(db.create_quick_capture("", None, None).is_err());
        assert!(db.create_quick_capture("invalid", None, Some("missing")).is_err());
        db.conn().unwrap().execute_batch("CREATE TRIGGER phase5_fail_insert BEFORE INSERT ON captures BEGIN SELECT RAISE(ABORT, 'injected persistence failure'); END;").unwrap();
        assert!(db.create_quick_capture("failed", None, None).is_err());
        db.conn().unwrap().execute_batch("DROP TRIGGER phase5_fail_insert;").unwrap();
    }
    drop(db);
    let db = fixture.open();
    let actual: usize = [WAITING_ROOM, primary.id.as_str(), nested.id.as_str()].iter().map(|id| db.list_captures(id).unwrap().len()).sum();
    assert_eq!(actual, 100);
    let ids: std::collections::HashSet<_> = expected.iter().map(|r| &r.id).collect();
    assert_eq!(ids.len(), 100);
    for record in expected { assert_eq!(db.get_capture(&record.id).unwrap(), record); }
    assert_eq!(db.capture_context().unwrap().primary_container_id, Some(primary.id));
}

#[test]
fn surface_creation_preserves_exact_text_title_route_and_primary() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let primary = db.create_project("Primary").unwrap();
    let nested = db.create_project_in("Nested", Some(&primary.id)).unwrap();
    db.set_primary_project(Some(&primary.id)).unwrap();
    let quick = db.create_quick_capture("first line\nsecond line  ", Some("Explicit title"), Some(&nested.id)).unwrap();
    assert_eq!(quick.content, "first line\nsecond line  ");
    assert_eq!(quick.title.as_deref(), Some("Explicit title"));
    assert_eq!(quick.container_id, nested.id);
    assert_eq!(quick.source, "hoverthought/quick-capture");
    assert_eq!(quick.created_at, quick.updated_at);
    assert_eq!(quick.created_at, quick.lifecycle_at);
    let next = db.create_quick_capture("Derived display only", None, None).unwrap();
    assert_eq!(next.container_id, primary.id);
    assert_eq!(next.title, None);
    let deliberate = db.create_project_note("", Some("Title only"), &nested.id).unwrap();
    assert_eq!(deliberate.container_id, nested.id);
    assert_eq!(deliberate.source, "hoverthought/project-note");
    assert_eq!(db.capture_context().unwrap().primary_container_id, Some(primary.id.clone()));
    assert!(db.create_project_note("text", None, WAITING_ROOM).is_err());
    assert!(db.create_project_note("text", None, "missing").is_err());
    assert!(db.create_quick_capture("text", None, Some("missing")).is_err());
    assert!(db.create_project_note(" \n", Some("  "), &nested.id).is_err());
    assert!(db.create_quick_capture("", None, None).is_err());
    assert_eq!(db.list_captures(&nested.id).unwrap().len(), 2);
    drop(db);
    assert_eq!(fixture.open().get_capture(&quick.id).unwrap(), quick);
}

#[test]
fn missing_destination_restore_repairs_container_without_changing_identity() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let project = db.create_project("Removed externally").unwrap();
    let capture = db.create_project_note("Keep me", None, &project.id).unwrap();
    let deleted = db.soft_delete_capture(&capture.id).unwrap();
    {
        let conn = db.conn().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = OFF;").unwrap();
        conn.execute("DELETE FROM containers WHERE id = ?", [&project.id]).unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    }
    db.conn().unwrap().execute_batch("CREATE TRIGGER fail_restore BEFORE UPDATE OF lifecycle_at ON captures BEGIN SELECT RAISE(ABORT, 'injected restore failure'); END;").unwrap();
    assert!(db.restore_capture(&capture.id).is_err());
    assert_eq!(db.get_capture_including_deleted(&capture.id).unwrap(), deleted);
    db.conn().unwrap().execute_batch("DROP TRIGGER fail_restore;").unwrap();
    let restored = db.restore_capture(&capture.id).unwrap();
    assert_eq!(restored.id, capture.id);
    assert_eq!(restored.created_at, capture.created_at);
    assert_eq!(restored.content, capture.content);
    assert_eq!(restored.container_id, WAITING_ROOM);
    assert_eq!(restored.deleted_at, None);
    assert!(restored.updated_at > capture.updated_at);
    assert!(restored.lifecycle_at > deleted.lifecycle_at);
    assert_eq!(db.restore_capture(&capture.id).unwrap(), restored);
}

#[test]
fn nested_contexts_preserve_membership_routing_and_history_across_restart() {
    let fixture = Fixture::new();
    let (root, child, sibling, record) = {
        let db = fixture.open();
        let root = db.create_project("Coding").unwrap();
        let child = db.create_project_in("Notary", Some(&root.id)).unwrap();
        let sibling = db.create_project_in("Other", Some(&root.id)).unwrap();
        let deep = db.create_project_in("Navigation", Some(&child.id)).unwrap();
        db.set_primary_project(Some(&deep.id)).unwrap();
        let record = db.create_capture("deep thought", None).unwrap();
        assert_eq!(record.container_id, deep.id);
        assert!(db.list_captures(&root.id).unwrap().is_empty());
        assert!(db.list_captures(&child.id).unwrap().is_empty());
        assert_eq!(db.list_captures(&deep.id).unwrap(), vec![record.clone()]);
        assert!(db.create_project_in("invalid", Some(WAITING_ROOM)).is_err());
        assert!(db.create_project_in("invalid", Some("missing")).is_err());
        assert!(db.create_project_in(" ", Some(&root.id)).is_err());
        assert_eq!(db.capture_context().unwrap().containers.len(), 5);
        assert_eq!(db.get_capture(&record.id).unwrap(), record);
        (root, child, sibling, record)
    };
    let db = fixture.open();
    let context = db.capture_context().unwrap();
    assert_eq!(context.containers.iter().find(|c| c.id == root.id).unwrap().parent_id, None);
    for id in [child.id, sibling.id] {
        assert_eq!(context.containers.iter().find(|c| c.id == id).unwrap().parent_id.as_deref(), Some(root.id.as_str()));
    }
    assert_eq!(db.get_capture(&record.id).unwrap(), record);
    assert_eq!(context.primary_container_id.as_deref(), Some(record.container_id.as_str()));
}

#[test]
fn primary_routing_persists_and_unset_falls_back_without_moving_existing_captures() {
    let fixture = Fixture::new();
    let (project, inbox, routed) = {
        let db = fixture.open();
        let inbox = db.create_capture("before Primary", None).unwrap();
        let project = db.create_project("  Coding  ").unwrap();
        assert_eq!(project.name, "Coding");
        assert_eq!(project.kind, "project");
        assert_eq!(Uuid::parse_str(&project.id).unwrap().get_version_num(), 7);
        assert_eq!(db.capture_context().unwrap().primary_container_id, None);
        db.set_primary_project(Some(&project.id)).unwrap();
        let routed = db.create_capture("  exact\ntext  ", None).unwrap();
        assert_eq!(routed.container_id, project.id);
        assert_eq!(routed.content, "  exact\ntext  ");
        assert_eq!(db.get_capture(&inbox.id).unwrap(), inbox);
        assert!(!serde_json::to_value(&routed).unwrap().as_object().unwrap().contains_key("primary"));
        (project, inbox, routed)
    };
    let db = fixture.open();
    assert_eq!(db.capture_context().unwrap().primary_container_id.as_deref(), Some(project.id.as_str()));
    assert_eq!(db.create_capture("after restart", None).unwrap().container_id, project.id);
    db.set_primary_project(None).unwrap();
    assert_eq!(db.create_capture("fallback", None).unwrap().container_id, WAITING_ROOM);
    assert_eq!(db.get_capture(&routed.id).unwrap(), routed);
    assert_eq!(db.get_capture(&inbox.id).unwrap(), inbox);
    let context = db.capture_context().unwrap();
    assert_eq!(context.containers.iter().find(|c| c.id == project.id).unwrap().capture_count, 2);
    assert_eq!(context.containers.iter().find(|c| c.id == WAITING_ROOM).unwrap().capture_count, 2);
    drop(db);
    assert_eq!(fixture.open().capture_context().unwrap().primary_container_id, None);
}

#[test]
fn invalid_primary_and_empty_project_leave_routing_unchanged() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let project = db.create_project("Work").unwrap();
    db.set_primary_project(Some(&project.id)).unwrap();
    assert!(db.create_project(" \n ").is_err());
    for invalid in ["", "missing", WAITING_ROOM] {
        assert!(db.set_primary_project(Some(invalid)).is_err());
        assert_eq!(db.capture_context().unwrap().primary_container_id.as_deref(), Some(project.id.as_str()));
    }
    assert_eq!(db.capture_context().unwrap().containers.len(), 2);
}

#[test]
fn reassignment_changes_only_container_and_semantic_time_and_survives_restart() {
    let fixture = Fixture::new();
    let (original, moved, view) = {
        let db = fixture.open();
        let a = db.create_project("A").unwrap();
        let b = db.create_project("B").unwrap();
        let original = db.create_capture("keep me", None).unwrap();
        db.conn().unwrap().execute("UPDATE captures SET extra_fields = ? WHERE id = ?",
            params![r#"{"future":{"keep":true}}"#, original.id]).unwrap();
        let original = db.get_capture(&original.id).unwrap();
        let mut view = db.get_presentation(&original.id).unwrap();
        view.width = 410.0;
        view.opacity = 0.4;
        db.save_presentation(&view).unwrap();
        let mut previous = original.clone();
        for destination in [&a.id, &b.id, WAITING_ROOM] {
            let moved = db.reassign_capture(&original.id, destination).unwrap();
            assert!(DateTime::parse_from_rfc3339(&moved.updated_at).unwrap() > DateTime::parse_from_rfc3339(&previous.updated_at).unwrap());
            let mut expected = original.clone();
            expected.container_id = destination.into();
            expected.updated_at = moved.updated_at.clone();
            assert_eq!(moved, expected);
            assert_eq!(db.reassign_capture(&moved.id, destination).unwrap(), moved);
            previous = moved;
        }
        for invalid in ["", "missing"] {
            assert!(db.reassign_capture(&original.id, invalid).is_err());
            assert_eq!(db.get_capture(&original.id).unwrap(), previous);
        }
        assert!(db.reassign_capture("missing", WAITING_ROOM).is_err());
        assert_eq!(db.get_presentation(&original.id).unwrap(), view);
        (original, previous, view)
    };
    let db = fixture.open();
    assert_eq!(db.get_capture(&original.id).unwrap(), moved);
    assert_eq!(db.get_presentation(&original.id).unwrap(), view);
}

#[test]
fn text_autosave_and_reassignment_do_not_overwrite_each_others_fields() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let project = db.create_project("Destination").unwrap();
    let original = db.create_capture("initial", None).unwrap();
    let moved = db.reassign_capture(&original.id, &project.id).unwrap();
    let saved = db.edit_capture_text(&original.id, "unsaved editor buffer", Some("title")).unwrap();
    assert_eq!(saved.container_id, project.id);
    assert_ne!(saved.updated_at, moved.updated_at);
    let returned = db.reassign_capture(&original.id, WAITING_ROOM).unwrap();
    assert_eq!(returned.content, "unsaved editor buffer");
    assert_eq!(returned.title.as_deref(), Some("title"));
    assert_eq!(returned.id, original.id);
    assert_eq!(returned.created_at, original.created_at);
    assert_eq!(db.edit_capture_text(&original.id, &returned.content, returned.title.as_deref()).unwrap(), returned);
}

#[test]
fn additive_routing_migration_preserves_phase_two_data_and_presentation() {
    let fixture = Fixture::new();
    let (record, view) = {
        let db = fixture.open();
        let record = db.create_capture("Phase 2", None).unwrap();
        let view = db.get_presentation(&record.id).unwrap();
        db.save_presentation(&view).unwrap();
        // A Phase 2 database has these same tables without capture_routing.
        db.conn().unwrap().execute_batch("DROP TABLE capture_routing;").unwrap();
        (record, view)
    };
    let db = fixture.open();
    assert_eq!(db.get_capture(&record.id).unwrap(), record);
    assert_eq!(db.get_presentation(&record.id).unwrap(), view);
    assert_eq!(db.capture_context().unwrap().primary_container_id, None);
    assert_eq!(db.create_capture("new", None).unwrap().container_id, WAITING_ROOM);
}

#[test]
fn creates_conforming_waiting_room_records_and_survives_restart() {
    let fixture = Fixture::new();
    let record = {
        let db = fixture.open();
        let record = db.create_capture("  Preserve my exact text\n- [ ] task  ", None).unwrap();
        assert_eq!(Uuid::parse_str(&record.id).unwrap().get_version_num(), 7);
        assert_eq!(record.record_type, "capture");
        assert_eq!(record.schema_version, "1.1");
        assert_eq!(record.source, "hoverthought/quick-capture");
        assert_eq!(record.container_id, WAITING_ROOM);
        assert_eq!(record.content, "  Preserve my exact text\n- [ ] task  ");
        assert!(record.title.is_none());
        assert!(record.derived_from.is_none());
        DateTime::parse_from_rfc3339(&record.created_at).unwrap();
        assert_eq!(record.created_at, record.updated_at);
        assert_eq!(record.lifecycle_at, record.created_at);
        assert_eq!(record.deleted_at, None);
        assert!(serde_json::to_value(&record).unwrap()["deleted_at"].is_null());
        record
    };
    assert_eq!(fixture.open().get_capture(&record.id).unwrap(), record);
}

#[test]
fn rapid_records_have_unique_stable_v7_ids() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let mut ids = std::collections::HashSet::new();
    for _ in 0..100 {
        let record = db.create_capture("same text", None).unwrap();
        assert!(ids.insert(record.id));
    }
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap().len(), 100);
    assert!(db.create_capture(" \n\t", None).is_err());
}

#[test]
fn semantic_edits_bump_time_and_preserve_identity() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let original = db.create_capture("moment", None).unwrap();
    let unchanged = db.edit_capture(&original.id, "moment", None, WAITING_ROOM).unwrap();
    assert_eq!(original, unchanged);
    let title = db.edit_capture(&original.id, "moment", Some("Completed title"), WAITING_ROOM).unwrap();
    assert!(title.updated_at > original.updated_at);
    let content = db.edit_capture(&original.id, "corrected transcription", title.title.as_deref(), WAITING_ROOM).unwrap();
    assert!(content.updated_at > title.updated_at);
    assert_eq!(content.id, original.id);
    assert_eq!(content.created_at, original.created_at);
    db.conn().unwrap().execute("INSERT INTO containers VALUES ('project', 'Project', 'project', NULL)", []).unwrap();
    let moved = db.edit_capture(&original.id, &content.content, content.title.as_deref(), "project").unwrap();
    assert!(moved.updated_at > content.updated_at);
    assert_eq!(moved.container_id, "project");
    assert!(db.edit_capture(&moved.id, "must roll back", None, "missing-container").is_err());
    assert_eq!(db.get_capture(&original.id).unwrap(), moved);
}

#[test]
fn every_presentation_change_is_separate_and_never_bumps_semantic_time() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let record = db.create_capture("thought", None).unwrap();
    let mut state = db.get_presentation(&record.id).unwrap();
    state.pos_x = -500.0;
    state.pos_y = 75.0;
    state.width = 620.0;
    state.height = 410.0;
    state.is_open = true;
    state.is_minimized = true;
    state.always_on_top = false;
    state.opacity = 0.4;
    db.save_presentation(&state).unwrap();
    assert_eq!(db.get_presentation(&record.id).unwrap(), state);
    assert_eq!(db.get_capture(&record.id).unwrap(), record);
    state.is_open = false;
    db.save_presentation(&state).unwrap();
    assert_eq!(db.get_capture(&record.id).unwrap(), record);
    let json = serde_json::to_value(&record).unwrap();
    for key in ["pos_x", "pos_y", "width", "height", "is_open", "is_minimized", "opacity", "always_on_top", "device_id"] {
        assert!(json.get(key).is_none(), "capture includes {key}");
    }
}

#[test]
fn preserves_unknown_fields_on_read_write_and_additive_reopen() {
    let fixture = Fixture::new();
    let original = {
        let db = fixture.open();
        let record = db.create_capture("thought", None).unwrap();
        db.conn().unwrap().execute("UPDATE captures SET extra_fields = ? WHERE id = ?",
            params![r#"{"future_tool":{"value":[1,2,3]}}"#, record.id]).unwrap();
        let read = db.get_capture(&record.id).unwrap();
        let serialized = serde_json::to_value(&read).unwrap();
        let decoded: Capture = serde_json::from_value(serialized.clone()).unwrap();
        assert_eq!(decoded, read);
        assert_eq!(serialized["future_tool"]["value"], serde_json::json!([1, 2, 3]));
        let edited = db.edit_capture(&record.id, "edited", None, WAITING_ROOM).unwrap();
        assert_eq!(edited.extra_fields, read.extra_fields);
        edited
    };
    assert_eq!(fixture.open().get_capture(&original.id).unwrap(), original);
}

#[test]
fn derivation_has_at_most_one_v7_source_and_never_mutates_it() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let source = db.create_capture("source", None).unwrap();
    let derived = db.create_capture("derived", Some(&source.id)).unwrap();
    assert_eq!(derived.derived_from.as_deref(), Some(source.id.as_str()));
    assert_ne!(source.id, derived.id);
    assert_eq!(db.get_capture(&source.id).unwrap(), source);
    for invalid in [Uuid::new_v4().to_string(), format!("{},{}", source.id, derived.id),
        format!("[\"{}\"]", source.id), String::new()] {
        assert!(db.create_capture("invalid source", Some(&invalid)).is_err());
    }
    let mut json = serde_json::to_value(&derived).unwrap();
    json["derived_from"] = serde_json::json!([source.id, derived.id]);
    assert!(serde_json::from_value::<Capture>(json).is_err());
}

#[test]
fn preserves_legacy_rows_during_capture_writes_and_restart() {
    let fixture = Fixture::new();
    let legacy = {
        let db = fixture.open();
        let legacy = db.create_note(120, 220).unwrap();
        let before = serde_json::to_value(db.get_note(&legacy.id).unwrap()).unwrap();
        db.create_capture("new thought", None).unwrap();
        (legacy.id, before)
    };
    assert_eq!(serde_json::to_value(fixture.open().get_note(&legacy.0).unwrap()).unwrap(), legacy.1);
}

#[test]
fn lifecycle_cycle_is_strictly_monotonic_and_isolated_from_semantic_and_view_state() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let original = db.create_capture("keep this moment", None).unwrap();
    let original = db.edit_capture_text(&original.id, &original.content, Some("keep title")).unwrap();
    let view = db.get_presentation(&original.id).unwrap();
    db.save_presentation(&view).unwrap();
    let mut previous = original.clone();
    // Full create -> delete -> restore -> delete -> restore cycle, without sleeps.
    for deleted in [true, false, true, false] {
        let current = if deleted { db.soft_delete_capture(&original.id) } else { db.restore_capture(&original.id) }.unwrap();
        assert!(DateTime::parse_from_rfc3339(&current.lifecycle_at).unwrap()
            > DateTime::parse_from_rfc3339(&previous.lifecycle_at).unwrap());
        assert_eq!(current.deleted_at, deleted.then(|| current.lifecycle_at.clone()));
        let mut expected = original.clone();
        expected.deleted_at = current.deleted_at.clone();
        expected.lifecycle_at = current.lifecycle_at.clone();
        assert_eq!(current, expected, "only the two lifecycle fields may change");
        let retry = if deleted { db.soft_delete_capture(&original.id) } else { db.restore_capture(&original.id) }.unwrap();
        assert_eq!(retry, current, "idempotent retry is not a transition");
        assert_eq!(db.get_capture_including_deleted(&original.id).unwrap(), current);
        previous = current;
    }
    assert_eq!(db.get_presentation(&original.id).unwrap(), view);
    let edited = db.edit_capture_text(&original.id, "corrected", Some("keep title")).unwrap();
    assert_eq!(edited.lifecycle_at, previous.lifecycle_at);
    assert!(DateTime::parse_from_rfc3339(&edited.updated_at).unwrap()
        > DateTime::parse_from_rfc3339(&previous.updated_at).unwrap());
    drop(db);
    assert_eq!(fixture.open().get_capture(&original.id).unwrap(), edited);
}

#[test]
fn lifecycle_advances_even_when_wall_clock_is_behind_previous_transition() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let record = db.create_capture("clock adjustment", None).unwrap();
    let future = (Local::now() + Duration::days(2)).to_rfc3339();
    db.conn().unwrap().execute("UPDATE captures SET lifecycle_at = ? WHERE id = ?", params![future, record.id]).unwrap();
    let mut previous = DateTime::parse_from_rfc3339(&future).unwrap();
    for deleted in [true, false, true, false] {
        let current = if deleted { db.soft_delete_capture(&record.id) } else { db.restore_capture(&record.id) }.unwrap();
        let time = DateTime::parse_from_rfc3339(&current.lifecycle_at).unwrap();
        assert_eq!(time, previous + Duration::microseconds(1));
        assert_eq!(current.updated_at, record.updated_at);
        previous = time;
    }
}

#[test]
fn deleted_records_are_filtered_from_default_reads_counts_and_edits_but_explicitly_readable() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let live = db.create_capture("live", None).unwrap();
    let record = db.create_capture("hide", None).unwrap();
    let deleted = db.soft_delete_capture(&record.id).unwrap();
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap(), vec![live]);
    assert!(matches!(db.get_capture(&record.id), Err(rusqlite::Error::QueryReturnedNoRows)));
    assert_eq!(db.capture_context().unwrap().containers[0].capture_count, 1);
    assert_eq!(db.list_deleted_captures().unwrap(), vec![deleted.clone()]);
    assert_eq!(db.get_capture_including_deleted(&record.id).unwrap(), deleted);
    assert!(db.get_presentation(&record.id).is_err());
    assert!(db.edit_capture_text(&record.id, "stale save", None).is_err());
    assert!(db.reassign_capture(&record.id, WAITING_ROOM).is_err());
    drop(db);
    let db = fixture.open();
    assert_eq!(db.list_deleted_captures().unwrap(), vec![deleted.clone()]);
    assert_eq!(serde_json::from_value::<Capture>(serde_json::to_value(deleted).unwrap()).unwrap().id, record.id);
    db.restore_capture(&record.id).unwrap();
    assert_eq!(db.capture_context().unwrap().containers[0].capture_count, 2);
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap().len(), 2);
    assert!(db.list_deleted_captures().unwrap().is_empty());
}

#[test]
fn lifecycle_remains_observable_when_semantic_time_is_ahead_of_wall_clock() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let record = db.create_capture("future semantic clock", None).unwrap();
    let future = (Local::now() + Duration::days(2)).to_rfc3339();
    db.conn().unwrap().execute("UPDATE captures SET updated_at = ? WHERE id = ?", params![future, record.id]).unwrap();
    let semantic_time = DateTime::parse_from_rfc3339(&future).unwrap();
    let mut observed = semantic_time;
    for deleted in [true, false, true, false] {
        let current = if deleted { db.soft_delete_capture(&record.id) } else { db.restore_capture(&record.id) }.unwrap();
        let change_time = semantic_time.max(DateTime::parse_from_rfc3339(&current.lifecycle_at).unwrap());
        assert!(change_time > observed, "a consumer's max timestamp must advance");
        assert_eq!(current.updated_at, future);
        observed = change_time;
    }
}

#[test]
fn existing_derivation_survives_source_soft_and_permanent_deletion() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let source = db.create_capture("source", None).unwrap();
    db.save_presentation(&db.get_presentation(&source.id).unwrap()).unwrap();
    let derived = db.create_capture("derived", Some(&source.id)).unwrap();
    assert_eq!(db.resolve_capture_source(&derived).unwrap(), Some(source.clone()));
    let deleted = db.soft_delete_capture(&source.id).unwrap();
    assert!(db.create_capture("new derivation", Some(&source.id)).is_err());
    for alias in [source.id.to_uppercase(), source.id.replace('-', "")] {
        assert!(db.create_capture("deleted alias", Some(&alias)).is_err());
    }
    let mut legacy_alias = derived.clone();
    legacy_alias.derived_from = Some(source.id.to_uppercase());
    assert_eq!(db.resolve_capture_source(&legacy_alias).unwrap(), Some(deleted.clone()));
    assert_eq!(db.get_capture(&derived.id).unwrap(), derived);
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap(), vec![derived.clone()]);
    assert_eq!(db.resolve_capture_source(&derived).unwrap(), Some(deleted));
    let restored = db.restore_capture(&source.id).unwrap();
    db.create_capture("allowed after restore", Some(&source.id)).unwrap();
    assert_eq!(db.get_capture(&source.id).unwrap(), restored);
    db.permanently_delete_capture(&source.id).unwrap();
    assert_eq!(db.get_capture(&derived.id).unwrap(), derived);
    assert_eq!(db.resolve_capture_source(&derived).unwrap(), None);
    assert_eq!(db.conn().unwrap().query_row("SELECT COUNT(*) FROM presentation_state WHERE record_id = ?",
        [&source.id], |row| row.get::<_, i64>(0)).unwrap(), 0);
    assert!(db.list_deleted_captures().unwrap().is_empty(), "no tombstone retained");
    drop(db);
    let db = fixture.open();
    assert_eq!(db.get_capture(&derived.id).unwrap(), derived);
    assert_eq!(db.resolve_capture_source(&derived).unwrap(), None);
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap().len(), 2);
    // Local absence is not proof that an ecosystem source never existed.
    let remote = Uuid::now_v7().to_string();
    let unresolved = db.create_capture("nonlocal provenance", Some(&remote)).unwrap();
    assert_eq!(db.resolve_capture_source(&unresolved).unwrap(), None);
}

#[test]
fn legacy_json_defaults_lifecycle_without_upgrading_and_preserves_unknown_fields() {
    let fixture = Fixture::new();
    let db = fixture.open();
    let record = db.create_capture("legacy serialization", None).unwrap();
    let mut json = serde_json::to_value(&record).unwrap();
    json["schema_version"] = "1.0".into();
    json.as_object_mut().unwrap().remove("deleted_at");
    json.as_object_mut().unwrap().remove("lifecycle_at");
    json["unknown_tool"] = serde_json::json!({"nested":[1,2,3]});
    let legacy: Capture = serde_json::from_value(json.clone()).unwrap();
    assert_eq!(legacy.schema_version, "1.0");
    assert_eq!(legacy.deleted_at, None);
    assert_eq!(legacy.lifecycle_at, legacy.created_at);
    assert_eq!(legacy.updated_at, record.updated_at);
    assert_eq!(serde_json::to_value(&legacy).unwrap()["unknown_tool"], json["unknown_tool"]);
    json["schema_version"] = "1.1".into();
    assert!(serde_json::from_value::<Capture>(json.clone()).is_err());
    json["lifecycle_at"] = Value::Null;
    assert!(serde_json::from_value::<Capture>(json.clone()).is_err());
    json["lifecycle_at"] = record.created_at.clone().into();
    assert!(serde_json::from_value::<Capture>(json.clone()).is_err(), "1.1 must include deleted_at independently of lifecycle_at");
    json["deleted_at"] = Value::Null;
    assert!(serde_json::from_value::<Capture>(json.clone()).is_ok());
    json["lifecycle_at"] = "".into();
    assert!(serde_json::from_value::<Capture>(json.clone()).is_err());
    json["schema_version"] = "1.0".into();
    json["lifecycle_at"] = Value::Null;
    assert!(serde_json::from_value::<Capture>(json).is_err(), "only absence permits a legacy default");
}

// Exact Phase 4 capture columns, with future SQL/JSON data and an existing FK.
fn seed_v10(fixture: &Fixture) -> rusqlite::Connection {
    std::fs::create_dir_all(&fixture.0).unwrap();
    let conn = rusqlite::Connection::open(fixture.0.join("notary.db")).unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;
        CREATE TABLE containers(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('waiting_room','project')), parent_id TEXT REFERENCES containers(id));
        INSERT INTO containers VALUES ('waiting-room','Waiting Room','waiting_room',NULL);
        CREATE TABLE captures(id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL CHECK(type='capture'),
            schema_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            source TEXT NOT NULL, content TEXT NOT NULL, container_id TEXT NOT NULL REFERENCES containers(id),
            title TEXT, derived_from TEXT, extra_fields TEXT NOT NULL DEFAULT '{}', future_column TEXT);
        INSERT INTO captures VALUES ('019a0123-4567-789a-8abc-123456789abc','capture','1.0',
            '2026-09-10T04:00:00-07:00','2026-09-10T05:00:00-07:00','hoverthought/quick-capture',
            'legacy text','waiting-room','legacy title',NULL,'{\"future\":{\"keep\":true}}','keep SQL');
        CREATE TABLE presentation_state(record_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
            device_id TEXT NOT NULL, pos_x REAL NOT NULL, pos_y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL,
            is_open INTEGER NOT NULL DEFAULT 0, is_minimized INTEGER NOT NULL DEFAULT 0,
            opacity REAL NOT NULL, always_on_top INTEGER NOT NULL, PRIMARY KEY(record_id,device_id));
        INSERT INTO presentation_state VALUES ('019a0123-4567-789a-8abc-123456789abc','local',12,34,330,222,0,0,0.4,1);
        CREATE INDEX future_index ON captures(future_column);
        CREATE TABLE semantic_audit(record_id TEXT);
        CREATE TRIGGER future_semantic_audit AFTER UPDATE OF updated_at ON captures
            BEGIN INSERT INTO semantic_audit VALUES (NEW.id); END;").unwrap();
    conn
}

#[test]
fn v11_migration_preserves_v10_identity_history_unknown_fields_and_presentation() {
    let fixture = Fixture::new();
    drop(seed_v10(&fixture));
    let db = fixture.open();
    let original = db.list_captures(WAITING_ROOM).unwrap().remove(0);
    assert_eq!(original.schema_version, "1.0");
    assert_eq!(original.lifecycle_at, original.created_at);
    assert_eq!(original.created_at, "2026-09-10T04:00:00-07:00");
    assert_eq!(original.updated_at, "2026-09-10T05:00:00-07:00");
    assert_eq!(original.deleted_at, None);
    assert_eq!(original.extra_fields["future"]["keep"], true);
    let view = db.get_presentation(&original.id).unwrap();
    assert_eq!((view.pos_x, view.pos_y, view.width, view.height, view.opacity), (12.0,34.0,330.0,222.0,0.4));
    assert_eq!(db.conn().unwrap().query_row("SELECT COUNT(*) FROM semantic_audit", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
    assert_eq!(db.conn().unwrap().query_row("SELECT future_column FROM captures WHERE id=?", [&original.id], |r| r.get::<_,String>(0)).unwrap(), "keep SQL");
    assert_eq!(db.conn().unwrap().query_row("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('future_index','future_semantic_audit')", [], |r| r.get::<_,i64>(0)).unwrap(), 2);
    // Both NULL and the ALTER sentinel are forbidden after migration commits.
    for expression in ["NULL", "''"] {
        assert!(db.conn().unwrap().execute(&format!("UPDATE captures SET lifecycle_at = {expression}"), []).is_err());
    }
    assert!(db.conn().unwrap().execute("INSERT INTO captures(id,type,schema_version,created_at,updated_at,source,content,container_id)
        VALUES ('omitted','capture','1.1','now','now','test/test','test','waiting-room')", []).is_err());
    let not_null: i64 = db.conn().unwrap().query_row("SELECT \"notnull\" FROM pragma_table_info('captures') WHERE name='lifecycle_at'", [], |r| r.get(0)).unwrap();
    assert_eq!(not_null, 1);
    let lifecycle_columns: i64 = db.conn().unwrap().query_row("SELECT COUNT(*) FROM pragma_table_info('presentation_state') WHERE name IN ('deleted_at','lifecycle_at')", [], |r| r.get(0)).unwrap();
    assert_eq!(lifecycle_columns, 0);
    db.soft_delete_capture(&original.id).unwrap();
    let restored = db.restore_capture(&original.id).unwrap();
    assert_eq!(restored.schema_version, "1.0");
    assert_eq!(restored.updated_at, original.updated_at);
    assert_eq!(restored.extra_fields, original.extra_fields);
    assert_eq!(db.conn().unwrap().query_row("SELECT COUNT(*) FROM semantic_audit", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
    let edited = db.edit_capture_text(&original.id, "corrected legacy", original.title.as_deref()).unwrap();
    assert_eq!(edited.schema_version, "1.0");
    assert_eq!(edited.lifecycle_at, restored.lifecycle_at);
    assert_eq!(db.create_capture("new version", None).unwrap().schema_version, "1.1");
    drop(db);
    let db = fixture.open();
    assert_eq!(db.get_capture(&original.id).unwrap(), edited);
    assert_eq!(db.get_presentation(&original.id).unwrap(), view);
}

#[test]
fn failed_lifecycle_backfill_rolls_back_columns_and_rows_atomically() {
    let fixture = Fixture::new();
    let observer = seed_v10(&fixture);
    observer.execute_batch("CREATE TRIGGER reject_migration BEFORE UPDATE ON captures
        BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;").unwrap();
    assert!(Database::new(fixture.0.clone()).is_err());
    assert_eq!(observer.query_row("SELECT COUNT(*) FROM pragma_table_info('captures') WHERE name IN ('deleted_at','lifecycle_at')", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
    assert_eq!(observer.query_row("SELECT updated_at FROM captures", [], |r| r.get::<_,String>(0)).unwrap(), "2026-09-10T05:00:00-07:00");
    observer.execute_batch("DROP TRIGGER reject_migration;").unwrap();
    let db = fixture.open();
    assert_eq!(observer.query_row("SELECT COUNT(*) FROM captures WHERE lifecycle_at IS NULL OR lifecycle_at <> created_at", [], |r| r.get::<_,i64>(0)).unwrap(), 0);
    assert_eq!(db.list_captures(WAITING_ROOM).unwrap()[0].schema_version, "1.0");
}
