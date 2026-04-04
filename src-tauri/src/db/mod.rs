mod crud;
mod schema;

pub use crud::{
    create_credential, delete_credential, extract_domain, get_credential, list_credentials,
    match_credentials_by_url, match_credentials_by_url_and_user, search_credentials,
    toggle_favorite, update_credential, CredentialMeta, CredentialRow,
};
pub use schema::{initialize_db, DbPool};
