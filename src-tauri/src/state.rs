use std::sync::Mutex;

use crate::crypto::DerivedKey;
use crate::db::DbPool;

pub struct AppState {
    pub db: DbPool,
    pub key: Mutex<Option<DerivedKey>>,
}
