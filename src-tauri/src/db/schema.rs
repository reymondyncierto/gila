use rusqlite::{Connection, Result};
use std::path::Path;
use std::sync::Mutex;

pub struct DbPool {
    conn: Mutex<Connection>,
}

impl DbPool {
    pub fn new(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("database mutex poisoned")
    }
}

/// Run all migrations to set up the vault schema.
pub fn initialize_db(pool: &DbPool) -> Result<()> {
    let conn = pool.conn();

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS vault_meta (
            key   TEXT PRIMARY KEY,
            value BLOB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credentials (
            id           TEXT PRIMARY KEY,
            cred_type    TEXT NOT NULL CHECK(cred_type IN ('login', 'app_password', 'api_key', 'wifi', 'secure_note')),
            name         TEXT NOT NULL,
            search_index TEXT NOT NULL DEFAULT '',
            data         BLOB NOT NULL,
            favorite     INTEGER NOT NULL DEFAULT 0,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(cred_type);
        CREATE INDEX IF NOT EXISTS idx_credentials_favorite ON credentials(favorite);
        CREATE INDEX IF NOT EXISTS idx_credentials_search ON credentials(search_index);
        ",
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn in_memory_pool() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        DbPool {
            conn: Mutex::new(conn),
        }
    }

    #[test]
    fn test_initialize_db_creates_tables() {
        let pool = in_memory_pool();
        initialize_db(&pool).unwrap();

        let conn = pool.conn();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert!(tables.contains(&"vault_meta".to_string()));
        assert!(tables.contains(&"credentials".to_string()));
    }

    #[test]
    fn test_initialize_db_idempotent() {
        let pool = in_memory_pool();
        initialize_db(&pool).unwrap();
        initialize_db(&pool).unwrap(); // Should not fail on re-run
    }

    #[test]
    fn test_vault_meta_stores_salt() {
        let pool = in_memory_pool();
        initialize_db(&pool).unwrap();

        let conn = pool.conn();
        let salt = vec![0xABu8; 16];
        conn.execute(
            "INSERT INTO vault_meta (key, value) VALUES ('salt', ?1)",
            [&salt],
        )
        .unwrap();

        let stored: Vec<u8> = conn
            .query_row("SELECT value FROM vault_meta WHERE key = 'salt'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(stored, salt);
    }

    #[test]
    fn test_credential_type_check_constraint() {
        let pool = in_memory_pool();
        initialize_db(&pool).unwrap();

        let conn = pool.conn();
        let result = conn.execute(
            "INSERT INTO credentials (id, cred_type, name, data) VALUES ('1', 'invalid_type', 'test', X'00')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_credential_insert_valid_types() {
        let pool = in_memory_pool();
        initialize_db(&pool).unwrap();

        let conn = pool.conn();
        let types = ["login", "app_password", "api_key", "wifi", "secure_note"];
        for (i, cred_type) in types.iter().enumerate() {
            conn.execute(
                "INSERT INTO credentials (id, cred_type, name, data) VALUES (?1, ?2, ?3, X'00')",
                rusqlite::params![format!("id-{}", i), cred_type, format!("test-{}", cred_type)],
            )
            .unwrap();
        }

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM credentials", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 5);
    }
}
