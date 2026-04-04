use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};

use super::schema::DbPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialRow {
    pub id: String,
    pub cred_type: String,
    pub name: String,
    pub search_index: String,
    pub data: Vec<u8>,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialMeta {
    pub id: String,
    pub cred_type: String,
    pub name: String,
    pub favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_credential(
    pool: &DbPool,
    id: &str,
    cred_type: &str,
    name: &str,
    search_index: &str,
    data: &[u8],
) -> Result<()> {
    let conn = pool.conn();
    conn.execute(
        "INSERT INTO credentials (id, cred_type, name, search_index, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, cred_type, name, search_index, data],
    )?;
    Ok(())
}

pub fn get_credential(pool: &DbPool, id: &str) -> Result<CredentialRow> {
    let conn = pool.conn();
    conn.query_row(
        "SELECT id, cred_type, name, search_index, data, favorite, created_at, updated_at FROM credentials WHERE id = ?1",
        params![id],
        |row| {
            Ok(CredentialRow {
                id: row.get(0)?,
                cred_type: row.get(1)?,
                name: row.get(2)?,
                search_index: row.get(3)?,
                data: row.get(4)?,
                favorite: row.get::<_, i32>(5)? != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
}

pub fn list_credentials(pool: &DbPool, cred_type: Option<&str>, favorites_only: bool) -> Result<Vec<CredentialMeta>> {
    let conn = pool.conn();
    let mut sql = String::from(
        "SELECT id, cred_type, name, favorite, created_at, updated_at FROM credentials WHERE 1=1",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ct) = cred_type {
        sql.push_str(" AND cred_type = ?");
        param_values.push(Box::new(ct.to_string()));
    }
    if favorites_only {
        sql.push_str(" AND favorite = 1");
    }
    sql.push_str(" ORDER BY updated_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(CredentialMeta {
            id: row.get(0)?,
            cred_type: row.get(1)?,
            name: row.get(2)?,
            favorite: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    rows.collect()
}

pub fn update_credential(
    pool: &DbPool,
    id: &str,
    name: &str,
    search_index: &str,
    data: &[u8],
) -> Result<usize> {
    let conn = pool.conn();
    conn.execute(
        "UPDATE credentials SET name = ?1, search_index = ?2, data = ?3, updated_at = datetime('now') WHERE id = ?4",
        params![name, search_index, data, id],
    )
}

pub fn delete_credential(pool: &DbPool, id: &str) -> Result<usize> {
    let conn = pool.conn();
    conn.execute("DELETE FROM credentials WHERE id = ?1", params![id])
}

pub fn toggle_favorite(pool: &DbPool, id: &str) -> Result<usize> {
    let conn = pool.conn();
    conn.execute(
        "UPDATE credentials SET favorite = CASE WHEN favorite = 0 THEN 1 ELSE 0 END, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )
}

pub fn search_credentials(pool: &DbPool, query: &str) -> Result<Vec<CredentialMeta>> {
    let conn = pool.conn();
    let pattern = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT id, cred_type, name, favorite, created_at, updated_at FROM credentials WHERE LOWER(search_index) LIKE ?1 OR LOWER(name) LIKE ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![pattern], |row| {
        Ok(CredentialMeta {
            id: row.get(0)?,
            cred_type: row.get(1)?,
            name: row.get(2)?,
            favorite: row.get::<_, i32>(3)? != 0,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;

    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::initialize_db;

    fn test_pool() -> DbPool {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let pool = DbPool::new_from_conn(conn);
        initialize_db(&pool).unwrap();
        pool
    }

    #[test]
    fn test_create_and_get_credential() {
        let pool = test_pool();
        create_credential(&pool, "id-1", "login", "Gmail", "gmail user@example.com", b"encrypted-data").unwrap();

        let cred = get_credential(&pool, "id-1").unwrap();
        assert_eq!(cred.name, "Gmail");
        assert_eq!(cred.cred_type, "login");
        assert_eq!(cred.data, b"encrypted-data");
        assert!(!cred.favorite);
    }

    #[test]
    fn test_list_all_credentials() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"data").unwrap();
        create_credential(&pool, "2", "wifi", "Home WiFi", "home wifi", b"data").unwrap();

        let all = list_credentials(&pool, None, false).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_list_by_type() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"data").unwrap();
        create_credential(&pool, "2", "wifi", "Home WiFi", "home wifi", b"data").unwrap();

        let logins = list_credentials(&pool, Some("login"), false).unwrap();
        assert_eq!(logins.len(), 1);
        assert_eq!(logins[0].name, "Gmail");
    }

    #[test]
    fn test_list_favorites_only() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"data").unwrap();
        create_credential(&pool, "2", "login", "GitHub", "github", b"data").unwrap();
        toggle_favorite(&pool, "1").unwrap();

        let favs = list_credentials(&pool, None, true).unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].name, "Gmail");
    }

    #[test]
    fn test_update_credential() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"old-data").unwrap();
        update_credential(&pool, "1", "Gmail Updated", "gmail updated", b"new-data").unwrap();

        let cred = get_credential(&pool, "1").unwrap();
        assert_eq!(cred.name, "Gmail Updated");
        assert_eq!(cred.data, b"new-data");
    }

    #[test]
    fn test_delete_credential() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"data").unwrap();
        delete_credential(&pool, "1").unwrap();

        let result = get_credential(&pool, "1");
        assert!(result.is_err());
    }

    #[test]
    fn test_search_credentials() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail user@example.com", b"data").unwrap();
        create_credential(&pool, "2", "login", "GitHub", "github dev@example.com", b"data").unwrap();
        create_credential(&pool, "3", "wifi", "Home WiFi", "home wifi", b"data").unwrap();

        let results = search_credentials(&pool, "gmail").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "Gmail");

        let results = search_credentials(&pool, "example").unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_toggle_favorite() {
        let pool = test_pool();
        create_credential(&pool, "1", "login", "Gmail", "gmail", b"data").unwrap();

        toggle_favorite(&pool, "1").unwrap();
        let cred = get_credential(&pool, "1").unwrap();
        assert!(cred.favorite);

        toggle_favorite(&pool, "1").unwrap();
        let cred = get_credential(&pool, "1").unwrap();
        assert!(!cred.favorite);
    }
}
