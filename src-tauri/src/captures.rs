//! Local record contract. Legacy `notes` remain independent and untouched.
use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Local};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::Database;

pub const WAITING_ROOM: &str = "waiting-room";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub capture_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptureContext {
    pub containers: Vec<Container>,
    pub primary_container_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "CaptureFields")]
pub struct Capture {
    pub id: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub schema_version: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
    pub lifecycle_at: String,
    pub source: String,
    pub content: String,
    pub container_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived_from: Option<String>,
    #[serde(flatten)]
    pub extra_fields: BTreeMap<String, Value>,
}

// Only legacy 1.0 readers may supply the lifecycle defaults. New records must
// carry an explicit, non-null lifecycle timestamp; unknown fields still round-trip.
#[derive(Deserialize)]
struct CaptureFields {
    id: String,
    #[serde(rename = "type")]
    record_type: String,
    schema_version: String,
    created_at: String,
    updated_at: String,
    #[serde(default, deserialize_with = "read_deleted_at")]
    deleted_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "read_lifecycle_at")]
    lifecycle_at: Option<String>,
    source: String,
    content: String,
    container_id: String,
    title: Option<String>,
    derived_from: Option<String>,
    #[serde(flatten)]
    extra_fields: BTreeMap<String, Value>,
}

fn read_deleted_at<'de, D: serde::Deserializer<'de>>(reader: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(reader).map(Some)
}

fn read_lifecycle_at<'de, D: serde::Deserializer<'de>>(reader: D) -> Result<Option<String>, D::Error> {
    String::deserialize(reader).map(Some)
}

impl TryFrom<CaptureFields> for Capture {
    type Error = &'static str;
    fn try_from(fields: CaptureFields) -> Result<Self, Self::Error> {
        let deleted_at = match fields.deleted_at {
            Some(value) => value,
            None if fields.schema_version == "1.0" => None,
            None => return Err("deleted_at is required (null when live)"),
        };
        let lifecycle_at = match fields.lifecycle_at {
            Some(value) => value,
            None if fields.schema_version == "1.0" => fields.created_at.clone(),
            None => return Err("lifecycle_at is required"),
        };
        DateTime::parse_from_rfc3339(&lifecycle_at).map_err(|_| "Invalid lifecycle_at")?;
        if let Some(value) = deleted_at.as_deref() {
            DateTime::parse_from_rfc3339(value).map_err(|_| "Invalid deleted_at")?;
        }
        Ok(Self {
            id: fields.id, record_type: fields.record_type, schema_version: fields.schema_version,
            created_at: fields.created_at, updated_at: fields.updated_at,
            deleted_at, lifecycle_at, source: fields.source,
            content: fields.content, container_id: fields.container_id, title: fields.title,
            derived_from: fields.derived_from, extra_fields: fields.extra_fields,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Presentation {
    pub record_id: String,
    pub device_id: String,
    /// Logical pixels, converted at the native window boundary.
    pub pos_x: f64,
    pub pos_y: f64,
    pub width: f64,
    pub height: f64,
    pub is_open: bool,
    pub is_minimized: bool,
    pub opacity: f64,
    pub always_on_top: bool,
}

impl Presentation {
    pub fn for_capture(record_id: String) -> Self {
        Self {
            record_id,
            device_id: "local".into(),
            pos_x: 100.0,
            pos_y: 100.0,
            width: 330.0,
            height: 222.0,
            is_open: false,
            is_minimized: false,
            opacity: 0.95,
            always_on_top: true,
        }
    }
}

fn error(message: impl ToString) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidInput,
        message.to_string(),
    )))
}

fn validate_source_id(value: &str) -> rusqlite::Result<String> {
    let id = Uuid::parse_str(value).map_err(error)?;
    if id.get_version_num() != 7 || id.get_variant() != uuid::Variant::RFC4122 {
        return Err(error("derived_from must be one UUIDv7"));
    }
    Ok(id.to_string())
}

/// Clock adjustments and rapid writes must not make semantic history go backward.
fn next_mutation(previous: &str) -> rusqlite::Result<String> {
    let previous = DateTime::parse_from_rfc3339(previous).map_err(error)?;
    let now = Local::now().fixed_offset();
    Ok(if now <= previous {
        previous.checked_add_signed(Duration::microseconds(1))
            .ok_or_else(|| error("Timestamp overflow"))?.to_rfc3339()
    } else {
        now.to_rfc3339()
    })
}

fn row_to_capture(row: &rusqlite::Row<'_>) -> rusqlite::Result<Capture> {
    let extra: String = row.get(10)?;
    Ok(Capture {
        id: row.get(0)?,
        record_type: row.get(1)?,
        schema_version: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        deleted_at: row.get(11)?,
        lifecycle_at: row.get(12)?,
        source: row.get(5)?,
        content: row.get(6)?,
        container_id: row.get(7)?,
        title: row.get(8)?,
        derived_from: row.get(9)?,
        extra_fields: serde_json::from_str(&extra).map_err(error)?,
    })
}

const CAPTURE_COLUMNS: &str = "id, type, schema_version, created_at, updated_at,
    source, content, container_id, title, derived_from, extra_fields, deleted_at, lifecycle_at";

impl Database {
    pub(crate) fn init_capture_tables(&self) -> rusqlite::Result<()> {
        let mut conn = self.conn()?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;")?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS containers (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('waiting_room', 'project')),
                parent_id TEXT REFERENCES containers(id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_waiting_room
                ON containers(kind) WHERE kind = 'waiting_room';
            INSERT OR IGNORE INTO containers(id, name, kind)
                VALUES ('waiting-room', 'Waiting Room', 'waiting_room');
            CREATE TABLE IF NOT EXISTS capture_routing (
                singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                primary_container_id TEXT REFERENCES containers(id)
            );
            INSERT OR IGNORE INTO capture_routing(singleton) VALUES (1);
            CREATE TABLE IF NOT EXISTS captures (
                id TEXT PRIMARY KEY NOT NULL,
                type TEXT NOT NULL CHECK(type = 'capture'),
                schema_version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT DEFAULT NULL,
                lifecycle_at TEXT NOT NULL,
                source TEXT NOT NULL,
                content TEXT NOT NULL,
                container_id TEXT NOT NULL REFERENCES containers(id),
                title TEXT,
                derived_from TEXT,
                extra_fields TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS captures_by_container
                ON captures(container_id, created_at);
            CREATE TABLE IF NOT EXISTS presentation_state (
                record_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
                device_id TEXT NOT NULL,
                pos_x REAL NOT NULL,
                pos_y REAL NOT NULL,
                width REAL NOT NULL,
                height REAL NOT NULL,
                is_open INTEGER NOT NULL DEFAULT 0,
                is_minimized INTEGER NOT NULL DEFAULT 0,
                opacity REAL NOT NULL,
                always_on_top INTEGER NOT NULL,
                PRIMARY KEY(record_id, device_id)
            );",
        )?;
        // SQLite cannot ADD a NOT NULL column with a per-row created_at default.
        // Add a constant sentinel, backfill, and reject future sentinel writes in
        // this SAME transaction. Other connections see the old schema or the
        // finished invariant, never the intermediate rows. No table rebuild:
        // unknown columns, indexes, triggers and presentation FKs are preserved.
        let columns = tx.prepare("PRAGMA table_info(captures)")?
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if !columns.iter().any(|name| name == "deleted_at") {
            tx.execute_batch("ALTER TABLE captures ADD COLUMN deleted_at TEXT DEFAULT NULL;")?;
        }
        if !columns.iter().any(|name| name == "lifecycle_at") {
            tx.execute_batch(
                "ALTER TABLE captures ADD COLUMN lifecycle_at TEXT NOT NULL DEFAULT '';
                 UPDATE captures SET lifecycle_at = created_at;"
            )?;
        }
        tx.execute_batch(
            "CREATE TRIGGER IF NOT EXISTS captures_require_lifecycle_insert
             BEFORE INSERT ON captures WHEN NEW.lifecycle_at IS NULL OR NEW.lifecycle_at = ''
             BEGIN SELECT RAISE(ABORT, 'lifecycle_at is required'); END;
             CREATE TRIGGER IF NOT EXISTS captures_require_lifecycle_update
             BEFORE UPDATE ON captures WHEN NEW.lifecycle_at IS NULL OR NEW.lifecycle_at = ''
             BEGIN SELECT RAISE(ABORT, 'lifecycle_at is required'); END;"
        )?;
        let invalid: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM captures WHERE lifecycle_at IS NULL OR lifecycle_at = '')",
            [], |row| row.get(0),
        )?;
        if invalid { return Err(error("Invalid lifecycle timestamp during migration")); }
        tx.commit()
    }

    pub fn capture_context(&self) -> rusqlite::Result<CaptureContext> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, c.kind, COUNT(r.id), c.parent_id FROM containers c
             LEFT JOIN captures r ON r.container_id = c.id AND r.deleted_at IS NULL GROUP BY c.id
             ORDER BY CASE c.kind WHEN 'waiting_room' THEN 0 ELSE 1 END, c.name COLLATE NOCASE, c.id"
        )?;
        let containers = stmt.query_map([], |row| Ok(Container {
            id: row.get(0)?, name: row.get(1)?, kind: row.get(2)?, capture_count: row.get(3)?,
            parent_id: row.get(4)?,
        }))?.collect::<rusqlite::Result<Vec<_>>>()?;
        let primary_container_id = conn.query_row(
            "SELECT c.id FROM capture_routing r JOIN containers c ON c.id = r.primary_container_id
             WHERE r.singleton = 1 AND c.kind = 'project'", [], |row| row.get(0)
        ).optional()?;
        Ok(CaptureContext { containers, primary_container_id })
    }

    pub fn create_project(&self, name: &str) -> rusqlite::Result<Container> {
        self.create_project_in(name, None)
    }

    pub fn create_project_in(&self, name: &str, parent_id: Option<&str>) -> rusqlite::Result<Container> {
        let name = name.trim();
        if name.is_empty() { return Err(error("A project needs a name")); }
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        if let Some(parent) = parent_id {
            let valid: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM containers WHERE id = ? AND kind = 'project')", [parent], |row| row.get(0))?;
            if !valid { return Err(error("Parent must be an existing project")); }
        }
        // Only newly generated IDs can become children; no reparenting path can
        // introduce a cycle or change existing captures' membership/history.
        let project = Container {
            id: Uuid::now_v7().to_string(), name: name.into(), kind: "project".into(), capture_count: 0,
            parent_id: parent_id.map(str::to_owned),
        };
        tx.execute("INSERT INTO containers(id, name, kind, parent_id) VALUES (?, ?, 'project', ?)",
            params![project.id, project.name, project.parent_id])?;
        tx.commit()?;
        Ok(project)
    }

    pub fn set_primary_project(&self, id: Option<&str>) -> rusqlite::Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        if let Some(id) = id {
            let is_project: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM containers WHERE id = ? AND kind = 'project')", [id], |r| r.get(0)
            )?;
            if !is_project { return Err(error("Primary must be an existing project")); }
        }
        tx.execute("UPDATE capture_routing SET primary_container_id = ? WHERE singleton = 1", [id])?;
        tx.commit()
    }

    /// This is the only new-record writer. No view/window fields enter it.
    pub fn create_capture(
        &self,
        content: &str,
        derived_from: Option<&str>,
    ) -> rusqlite::Result<Capture> {
        self.create_capture_options(content, None, None, "hoverthought/quick-capture", derived_from)
    }

    pub fn create_quick_capture(&self, content: &str, title: Option<&str>, destination: Option<&str>) -> rusqlite::Result<Capture> {
        self.create_capture_options(content, title, destination, "hoverthought/quick-capture", None)
    }

    pub fn create_project_note(&self, content: &str, title: Option<&str>, project: &str) -> rusqlite::Result<Capture> {
        self.create_capture_options(content, title, Some(project), "hoverthought/project-note", None)
    }

    fn create_capture_options(&self, content: &str, title: Option<&str>, destination: Option<&str>, source: &str,
        derived_from: Option<&str>) -> rusqlite::Result<Capture> {
        let title = title.filter(|value| !value.trim().is_empty());
        if content.trim().is_empty() && title.is_none() {
            return Err(error("A capture needs some text"));
        }
        let derived_from = derived_from.map(validate_source_id).transpose()?;
        // Resolve and validate the one-capture destination in the constructor's
        // transaction. Explicit routing never writes the Primary preference.
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if let Some(source_id) = derived_from.as_deref() {
            let deleted: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM captures WHERE id = ? AND deleted_at IS NOT NULL)",
                [source_id], |row| row.get(0),
            )?;
            if deleted { return Err(error("A deleted capture cannot be a derivation source")); }
        }
        // Preserve existing nonlocal UUID provenance. Local absence does not
        // establish nonexistence in another tool; it resolves as unknown here.
        if let Some(id) = destination {
            let kind: Option<String> = tx.query_row("SELECT kind FROM containers WHERE id = ?", [id], |row| row.get(0)).optional()?;
            if kind.is_none() || (source == "hoverthought/project-note" && kind.as_deref() != Some("project")) {
                return Err(error("Destination must be an existing valid container"));
            }
        }
        let automatic: Option<String> = tx.query_row(
            "SELECT c.id FROM capture_routing r JOIN containers c ON c.id = r.primary_container_id
             WHERE r.singleton = 1 AND c.kind = 'project'", [], |row| row.get(0)
        ).optional()?;
        let record = Capture {
            id: Uuid::now_v7().to_string(),
            record_type: "capture".into(),
            schema_version: "1.1".into(),
            created_at: Local::now().to_rfc3339(),
            updated_at: String::new(),
            deleted_at: None,
            lifecycle_at: String::new(),
            source: source.into(),
            content: content.into(),
            container_id: destination.map(str::to_owned).or(automatic).unwrap_or_else(|| WAITING_ROOM.into()),
            title: title.map(str::to_owned),
            derived_from,
            extra_fields: BTreeMap::new(),
        };
        let record = Capture { updated_at: record.created_at.clone(), lifecycle_at: record.created_at.clone(), ..record };
        tx.execute(
            "INSERT INTO captures(id, type, schema_version, created_at, updated_at,
                source, content, container_id, title, derived_from, deleted_at, lifecycle_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![record.id, record.record_type, record.schema_version,
                record.created_at, record.updated_at, record.source, record.content,
                record.container_id, record.title, record.derived_from, record.deleted_at, record.lifecycle_at],
        )?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_captures(&self, container_id: &str) -> rusqlite::Result<Vec<Capture>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {CAPTURE_COLUMNS} FROM captures WHERE container_id = ? AND deleted_at IS NULL ORDER BY id DESC"
        ))?;
        let records = stmt.query_map([container_id], row_to_capture)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(records)
    }

    pub fn get_capture(&self, id: &str) -> rusqlite::Result<Capture> {
        let conn = self.conn()?;
        conn.query_row(&format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ? AND deleted_at IS NULL"),
            [id], row_to_capture)
    }

    /// Explicit lifecycle/provenance read, never used by default retrieval.
    pub fn get_capture_including_deleted(&self, id: &str) -> rusqlite::Result<Capture> {
        let conn = self.conn()?;
        conn.query_row(&format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ?"),
            [id], row_to_capture)
    }

    pub fn list_deleted_captures(&self) -> rusqlite::Result<Vec<Capture>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {CAPTURE_COLUMNS} FROM captures WHERE deleted_at IS NOT NULL ORDER BY id DESC"
        ))?;
        let records = stmt.query_map([], row_to_capture)?.collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(records)
    }

    /// Existing provenance survives soft deletion. A missing source is unknown,
    /// while real storage/decoding failures still propagate as errors.
    pub fn resolve_capture_source(&self, record: &Capture) -> rusqlite::Result<Option<Capture>> {
        match record.derived_from.as_deref() {
            Some(id) => self.get_capture_including_deleted(&validate_source_id(id)?).optional(),
            None => Ok(None),
        }
    }

    pub fn soft_delete_capture(&self, id: &str) -> rusqlite::Result<Capture> {
        self.set_capture_deleted(id, true)
    }

    pub fn restore_capture(&self, id: &str) -> rusqlite::Result<Capture> {
        self.set_capture_deleted(id, false)
    }

    fn set_capture_deleted(&self, id: &str, deleted: bool) -> rusqlite::Result<Capture> {
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let mut record = tx.query_row(&format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ?"),
            [id], row_to_capture)?;
        // Retried requests are no-ops, not additional lifecycle transitions.
        if record.deleted_at.is_some() != deleted {
            if !deleted {
                let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM containers WHERE id = ?)",
                    [&record.container_id], |row| row.get(0))?;
                if !exists {
                    // Restoration itself is lifecycle-only. Repairing a missing
                    // destination is a distinct semantic container change.
                    record.container_id = WAITING_ROOM.into();
                    record.updated_at = next_mutation(&record.updated_at)?;
                    tx.execute("UPDATE captures SET container_id = ?, updated_at = ? WHERE id = ?",
                        params![record.container_id, record.updated_at, id])?;
                }
            }
            // A clock rollback can leave semantic time ahead of lifecycle time.
            // Advance past BOTH so max(updated_at, lifecycle_at) observes restore.
            let previous = if DateTime::parse_from_rfc3339(&record.updated_at).map_err(error)?
                > DateTime::parse_from_rfc3339(&record.lifecycle_at).map_err(error)? {
                &record.updated_at
            } else { &record.lifecycle_at };
            record.lifecycle_at = next_mutation(previous)?;
            record.deleted_at = deleted.then(|| record.lifecycle_at.clone());
            tx.execute("UPDATE captures SET deleted_at = ?, lifecycle_at = ? WHERE id = ?",
                params![record.deleted_at, record.lifecycle_at, id])?;
        }
        tx.commit()?;
        Ok(record)
    }

    /// No tombstone; presentation cascades, but derived_from is deliberately not
    /// a foreign key so existing derived records are never blocked or removed.
    pub fn permanently_delete_capture(&self, id: &str) -> rusqlite::Result<()> {
        self.conn()?.execute("DELETE FROM captures WHERE id = ?", [id])?;
        Ok(())
    }

    /// Patch only semantic columns. Unknown JSON and future SQL columns survive.
    pub fn edit_capture(
        &self,
        id: &str,
        content: &str,
        title: Option<&str>,
        container_id: &str,
    ) -> rusqlite::Result<Capture> {
        self.patch_capture(id, Some(content), Some(title), Some(container_id))
    }

    pub fn edit_capture_text(&self, id: &str, content: &str, title: Option<&str>) -> rusqlite::Result<Capture> {
        self.patch_capture(id, Some(content), Some(title), None)
    }

    pub fn reassign_capture(&self, id: &str, container_id: &str) -> rusqlite::Result<Capture> {
        self.patch_capture(id, None, None, Some(container_id))
    }

    // Apply only the supplied fields under one lock/transaction. In particular,
    // an autosave cannot put back a destination read before a concurrent move.
    fn patch_capture(&self, id: &str, content: Option<&str>, title: Option<Option<&str>>,
        container_id: Option<&str>) -> rusqlite::Result<Capture> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let mut record = tx.query_row(
            &format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ? AND deleted_at IS NULL"),
            [id], row_to_capture,
        )?;
        let content = content.unwrap_or(&record.content).to_owned();
        let title = title.map(|value| value.filter(|s| !s.is_empty()).map(str::to_owned))
            .unwrap_or_else(|| record.title.clone());
        let container_id = container_id.unwrap_or(&record.container_id).to_owned();
        if record.content != content || record.title != title || record.container_id != container_id {
            record.updated_at = next_mutation(&record.updated_at)?;
            record.content = content.into();
            record.title = title;
            record.container_id = container_id.into();
            tx.execute(
                "UPDATE captures SET content = ?, title = ?, container_id = ?, updated_at = ? WHERE id = ?",
                params![record.content, record.title, record.container_id, record.updated_at, id],
            )?;
        }
        tx.commit()?;
        Ok(record)
    }

    pub fn has_capture_presentation(&self, id: &str) -> rusqlite::Result<bool> {
        self.conn()?.query_row("SELECT EXISTS(SELECT 1 FROM presentation_state WHERE record_id = ? AND device_id = 'local')", [id], |row| row.get(0))
    }

    pub fn get_presentation(&self, id: &str) -> rusqlite::Result<Presentation> {
        // Fail for a nonexistent record instead of creating orphan presentation.
        self.get_capture(id)?;
        let conn = self.conn()?;
        Ok(conn.query_row(
            "SELECT record_id, device_id, pos_x, pos_y, width, height, is_open,
                is_minimized, opacity, always_on_top FROM presentation_state
             WHERE record_id = ? AND device_id = 'local'",
            [id],
            |row| Ok(Presentation {
                record_id: row.get(0)?, device_id: row.get(1)?, pos_x: row.get(2)?,
                pos_y: row.get(3)?, width: row.get(4)?, height: row.get(5)?,
                is_open: row.get(6)?, is_minimized: row.get(7)?, opacity: row.get(8)?,
                always_on_top: row.get(9)?,
            }),
        ).optional()?.unwrap_or_else(|| Presentation::for_capture(id.into())))
    }

    pub fn save_presentation(&self, state: &Presentation) -> rusqlite::Result<()> {
        if ![state.pos_x, state.pos_y, state.width, state.height, state.opacity]
            .iter().all(|v| v.is_finite()) || state.width < 200.0 || state.height < 150.0
            || !(0.1..=1.0).contains(&state.opacity) || state.device_id != "local" {
            return Err(error("Invalid presentation state"));
        }
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO presentation_state(record_id, device_id, pos_x, pos_y,
                width, height, is_open, is_minimized, opacity, always_on_top)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(record_id, device_id) DO UPDATE SET
                pos_x = excluded.pos_x, pos_y = excluded.pos_y, width = excluded.width,
                height = excluded.height, is_open = excluded.is_open,
                is_minimized = excluded.is_minimized, opacity = excluded.opacity,
                always_on_top = excluded.always_on_top",
            params![state.record_id, state.device_id, state.pos_x, state.pos_y,
                state.width, state.height, state.is_open, state.is_minimized,
                state.opacity, state.always_on_top],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
