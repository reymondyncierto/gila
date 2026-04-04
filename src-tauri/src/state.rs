use std::sync::{Arc, Mutex};

use crate::auth::AuthState;
use crate::crypto::DerivedKey;
use crate::db::DbPool;

pub struct AppState {
    pub db: DbPool,
    pub key: Arc<Mutex<Option<DerivedKey>>>,
    pub auth: Arc<Mutex<AuthState>>,
}
