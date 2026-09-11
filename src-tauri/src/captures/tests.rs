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
        assert_eq!(record.schema_version, "1.0");
        assert_eq!(record.source, "hoverthought/quick-capture");
        assert_eq!(record.container_id, WAITING_ROOM);
        assert_eq!(record.content, "  Preserve my exact text\n- [ ] task  ");
        assert!(record.title.is_none());
        assert!(record.derived_from.is_none());
        DateTime::parse_from_rfc3339(&record.created_at).unwrap();
        assert_eq!(record.created_at, record.updated_at);
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
