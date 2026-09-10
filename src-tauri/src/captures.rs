//! Local record contract. Legacy `notes` remain independent and untouched.
use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Local};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::Database;

pub const WAITING_ROOM: &str = "waiting-room";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Capture {
    pub id: String,
    #[serde(rename = "type")]
    pub record_type: String,
    pub schema_version: String,
    pub created_at: String,
    pub updated_at: String,
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
            width: 560.0,
            height: 380.0,
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

fn validate_source_id(value: &str) -> rusqlite::Result<()> {
    let id = Uuid::parse_str(value).map_err(error)?;
    if id.get_version_num() != 7 || id.get_variant() != uuid::Variant::RFC4122 {
        return Err(error("derived_from must be one UUIDv7"));
    }
    Ok(())
}

/// Clock adjustments and rapid writes must not make semantic history go backward.
fn next_mutation(previous: &str) -> rusqlite::Result<String> {
    let previous = DateTime::parse_from_rfc3339(previous).map_err(error)?;
    let now = Local::now().fixed_offset();
    Ok(if now <= previous {
        (previous + Duration::microseconds(1)).to_rfc3339()
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
        source: row.get(5)?,
        content: row.get(6)?,
        container_id: row.get(7)?,
        title: row.get(8)?,
        derived_from: row.get(9)?,
        extra_fields: serde_json::from_str(&extra).map_err(error)?,
    })
}

const CAPTURE_COLUMNS: &str = "id, type, schema_version, created_at, updated_at,
    source, content, container_id, title, derived_from, extra_fields";

impl Database {
    pub(crate) fn init_capture_tables(&self) -> rusqlite::Result<()> {
        let mut conn = self.conn()?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;")?;
        let tx = conn.transaction()?;
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
            CREATE TABLE IF NOT EXISTS captures (
                id TEXT PRIMARY KEY NOT NULL,
                type TEXT NOT NULL CHECK(type = 'capture'),
                schema_version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
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
        tx.commit()
    }

    /// This is the only new-record writer. No view/window fields enter it.
    pub fn create_capture(
        &self,
        content: &str,
        derived_from: Option<&str>,
    ) -> rusqlite::Result<Capture> {
        if content.trim().is_empty() {
            return Err(error("A capture needs some text"));
        }
        if let Some(source_id) = derived_from {
            validate_source_id(source_id)?;
        }
        let record = Capture {
            id: Uuid::now_v7().to_string(),
            record_type: "capture".into(),
            schema_version: "1.0".into(),
            created_at: Local::now().to_rfc3339(),
            updated_at: String::new(),
            source: "hoverthought/quick-capture".into(),
            content: content.into(),
            container_id: WAITING_ROOM.into(),
            title: None,
            derived_from: derived_from.map(str::to_owned),
            extra_fields: BTreeMap::new(),
        };
        let record = Capture { updated_at: record.created_at.clone(), ..record };
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO captures(id, type, schema_version, created_at, updated_at,
                source, content, container_id, title, derived_from)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![record.id, record.record_type, record.schema_version,
                record.created_at, record.updated_at, record.source, record.content,
                record.container_id, record.title, record.derived_from],
        )?;
        Ok(record)
    }

    pub fn list_captures(&self, container_id: &str) -> rusqlite::Result<Vec<Capture>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&format!(
            "SELECT {CAPTURE_COLUMNS} FROM captures WHERE container_id = ? ORDER BY id DESC"
        ))?;
        let records = stmt.query_map([container_id], row_to_capture)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(records)
    }

    pub fn get_capture(&self, id: &str) -> rusqlite::Result<Capture> {
        let conn = self.conn()?;
        conn.query_row(&format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ?"),
            [id], row_to_capture)
    }

    /// Patch only semantic columns. Unknown JSON and future SQL columns survive.
    pub fn edit_capture(
        &self,
        id: &str,
        content: &str,
        title: Option<&str>,
        container_id: &str,
    ) -> rusqlite::Result<Capture> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        let mut record = tx.query_row(
            &format!("SELECT {CAPTURE_COLUMNS} FROM captures WHERE id = ?"),
            [id], row_to_capture,
        )?;
        let title = title.filter(|s| !s.is_empty()).map(str::to_owned);
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
