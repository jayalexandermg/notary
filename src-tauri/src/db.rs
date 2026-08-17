use rusqlite::{Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub mode: String,  // "text" or "todo"
    pub color: String,
    pub auto_stamp: bool,
    pub pos_x: i32,
    pub pos_y: i32,
    pub width: i32,
    pub height: i32,
    pub opacity: f64,
    pub is_open: bool,
    pub is_minimized: bool,
    pub always_on_top: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub default_opacity: f64,
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    fn conn(&self) -> SqlResult<std::sync::MutexGuard<'_, Connection>> {
        self.conn.lock().map_err(|_| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
                Some("database lock poisoned".to_string()),
            )
        })
    }

    pub fn new(app_data_dir: PathBuf) -> SqlResult<Self> {
        std::fs::create_dir_all(&app_data_dir).ok();
        let db_path = app_data_dir.join("notary.db");
        let conn = Connection::open(db_path)?;

        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqlResult<()> {
        let conn = self.conn()?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                pos_x INTEGER NOT NULL,
                pos_y INTEGER NOT NULL,
                width INTEGER NOT NULL DEFAULT 300,
                height INTEGER NOT NULL DEFAULT 200,
                opacity REAL NOT NULL DEFAULT 0.95,
                is_open INTEGER NOT NULL DEFAULT 1,
                is_minimized INTEGER NOT NULL DEFAULT 0,
                always_on_top INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )?;

        // Migrations
        let _ = conn.execute("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''", []);
        let _ = conn.execute("ALTER TABLE notes ADD COLUMN mode TEXT NOT NULL DEFAULT 'text'", []);
        let _ = conn.execute("ALTER TABLE notes ADD COLUMN color TEXT NOT NULL DEFAULT 'yellow'", []);
        let _ = conn.execute("ALTER TABLE notes ADD COLUMN auto_stamp INTEGER NOT NULL DEFAULT 0", []);

        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        // Initialize default settings if not exist
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'light')",
            [],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('default_opacity', '0.95')",
            [],
        )?;

        Ok(())
    }

    fn row_to_note(row: &rusqlite::Row) -> SqlResult<Note> {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            mode: row.get(3)?,
            color: row.get(4)?,
            auto_stamp: row.get::<_, i32>(5)? == 1,
            pos_x: row.get(6)?,
            pos_y: row.get(7)?,
            width: row.get(8)?,
            height: row.get(9)?,
            opacity: row.get(10)?,
            is_open: row.get::<_, i32>(11)? == 1,
            is_minimized: row.get::<_, i32>(12)? == 1,
            always_on_top: row.get::<_, i32>(13)? == 1,
            created_at: row.get(14)?,
            updated_at: row.get(15)?,
        })
    }

    const NOTE_COLUMNS: &'static str =
        "id, title, content, mode, color, auto_stamp, pos_x, pos_y, width, height, opacity,
         is_open, is_minimized, always_on_top, created_at, updated_at";

    pub fn get_all_notes(&self) -> SqlResult<Vec<Note>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            &format!("SELECT {} FROM notes ORDER BY created_at", Self::NOTE_COLUMNS)
        )?;

        let notes = stmt.query_map([], Self::row_to_note)?.collect::<SqlResult<Vec<_>>>()?;

        Ok(notes)
    }

    pub fn get_open_notes(&self) -> SqlResult<Vec<Note>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            &format!("SELECT {} FROM notes WHERE is_open = 1 ORDER BY created_at", Self::NOTE_COLUMNS)
        )?;

        let notes = stmt.query_map([], Self::row_to_note)?.collect::<SqlResult<Vec<_>>>()?;

        Ok(notes)
    }

    pub fn get_note(&self, id: &str) -> SqlResult<Option<Note>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            &format!("SELECT {} FROM notes WHERE id = ?", Self::NOTE_COLUMNS)
        )?;

        let mut notes = stmt.query_map([id], Self::row_to_note)?;

        match notes.next() {
            Some(note) => Ok(Some(note?)),
            None => Ok(None),
        }
    }

    pub fn create_note(&self, pos_x: i32, pos_y: i32) -> SqlResult<Note> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let default_opacity = self.get_setting("default_opacity")
            .unwrap_or_else(|_| "0.95".to_string())
            .parse::<f64>()
            .unwrap_or(0.95);

        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO notes (id, title, content, mode, color, auto_stamp, pos_x, pos_y, width, height, opacity,
                               is_open, is_minimized, always_on_top, created_at, updated_at)
             VALUES (?, '', '', 'text', 'yellow', 0, ?, ?, 300, 200, ?, 1, 0, 1, ?, ?)",
            rusqlite::params![id, pos_x, pos_y, default_opacity, now, now],
        )?;

        Ok(Note {
            id,
            title: String::new(),
            content: String::new(),
            mode: "text".to_string(),
            color: "yellow".to_string(),
            auto_stamp: false,
            pos_x,
            pos_y,
            width: 300,
            height: 200,
            opacity: default_opacity,
            is_open: true,
            is_minimized: false,
            always_on_top: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_note(&self, id: &str, title: Option<&str>, content: Option<&str>,
                       mode: Option<&str>, color: Option<&str>, auto_stamp: Option<bool>,
                       pos_x: Option<i32>,
                       pos_y: Option<i32>, width: Option<i32>, height: Option<i32>,
                       opacity: Option<f64>, always_on_top: Option<bool>) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn()?;

        conn.execute_batch("BEGIN")?;

        let result = (|| -> SqlResult<()> {
            if let Some(title) = title {
                conn.execute(
                    "UPDATE notes SET title = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![title, now, id],
                )?;
            }

            if let Some(content) = content {
                conn.execute(
                    "UPDATE notes SET content = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![content, now, id],
                )?;
            }

            if let Some(mode) = mode {
                conn.execute(
                    "UPDATE notes SET mode = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![mode, now, id],
                )?;
            }

            if let Some(color) = color {
                conn.execute(
                    "UPDATE notes SET color = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![color, now, id],
                )?;
            }

            if let Some(auto_stamp) = auto_stamp {
                conn.execute(
                    "UPDATE notes SET auto_stamp = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![auto_stamp as i32, now, id],
                )?;
            }

            if let (Some(x), Some(y)) = (pos_x, pos_y) {
                conn.execute(
                    "UPDATE notes SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![x, y, now, id],
                )?;
            }

            if let (Some(w), Some(h)) = (width, height) {
                conn.execute(
                    "UPDATE notes SET width = ?, height = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![w, h, now, id],
                )?;
            }

            if let Some(opacity) = opacity {
                conn.execute(
                    "UPDATE notes SET opacity = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![opacity, now, id],
                )?;
            }

            if let Some(on_top) = always_on_top {
                conn.execute(
                    "UPDATE notes SET always_on_top = ?, updated_at = ? WHERE id = ?",
                    rusqlite::params![on_top as i32, now, id],
                )?;
            }

            Ok(())
        })();

        match result {
            Ok(()) => {
                conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    pub fn open_note(&self, id: &str) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn()?;
        conn.execute(
            "UPDATE notes SET is_open = 1, updated_at = ? WHERE id = ?",
            rusqlite::params![now, id],
        )?;
        Ok(())
    }

    pub fn close_note(&self, id: &str) -> SqlResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self.conn()?;
        conn.execute(
            "UPDATE notes SET is_open = 0, updated_at = ? WHERE id = ?",
            rusqlite::params![now, id],
        )?;
        Ok(())
    }

    pub fn delete_note(&self, id: &str) -> SqlResult<()> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM notes WHERE id = ?", [id])?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> SqlResult<String> {
        let conn = self.conn()?;
        let value: String = conn.query_row(
            "SELECT value FROM settings WHERE key = ?",
            [key],
            |row| row.get(0),
        )?;
        Ok(value)
    }

    /// Like `get_setting`, but `None` for a key that was never set instead of an error —
    /// used by the generic get/set settings command for user-configurable values
    /// (keymap, global hotkeys, universal mode) that may not exist yet.
    pub fn get_setting_opt(&self, key: &str) -> SqlResult<Option<String>> {
        match self.get_setting(key) {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> SqlResult<()> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [key, value],
        )?;
        Ok(())
    }

    pub fn get_settings(&self) -> SqlResult<Settings> {
        Ok(Settings {
            theme: self.get_setting("theme").unwrap_or_else(|_| "light".to_string()),
            default_opacity: self.get_setting("default_opacity")
                .unwrap_or_else(|_| "0.95".to_string())
                .parse()
                .unwrap_or(0.95),
        })
    }
}
