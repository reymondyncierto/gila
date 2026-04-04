use argon2::{Argon2, Params, Version};
use rand::rngs::OsRng;
use zeroize::{Zeroize, ZeroizeOnDrop};

pub const SALT_LEN: usize = 16;
pub const KEY_LEN: usize = 32;

pub type Salt = [u8; SALT_LEN];

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct DerivedKey {
    bytes: [u8; KEY_LEN],
}

impl DerivedKey {
    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.bytes
    }
}

/// Generate a cryptographically random 16-byte salt.
pub fn generate_salt() -> Salt {
    let mut salt = [0u8; SALT_LEN];
    use rand::RngCore;
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Derive a 256-bit key from a password and salt using Argon2id.
pub fn derive_key(password: &[u8], salt: &Salt) -> Result<DerivedKey, argon2::Error> {
    let params = Params::new(
        19 * 1024, // 19 MiB memory cost
        2,         // 2 iterations
        1,         // 1 degree of parallelism
        Some(KEY_LEN),
    )?;

    let argon2 = Argon2::new(argon2::Algorithm::Argon2id, Version::V0x13, params);

    let mut key_bytes = [0u8; KEY_LEN];
    argon2.hash_password_into(password, salt, &mut key_bytes)?;

    Ok(DerivedKey { bytes: key_bytes })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_salt_uniqueness() {
        let salt1 = generate_salt();
        let salt2 = generate_salt();
        assert_ne!(salt1, salt2);
    }

    #[test]
    fn test_generate_salt_length() {
        let salt = generate_salt();
        assert_eq!(salt.len(), SALT_LEN);
    }

    #[test]
    fn test_derive_key_deterministic() {
        let password = b"test-password";
        let salt = generate_salt();
        let key1 = derive_key(password, &salt).unwrap();
        let key2 = derive_key(password, &salt).unwrap();
        assert_eq!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_key_length() {
        let password = b"test-password";
        let salt = generate_salt();
        let key = derive_key(password, &salt).unwrap();
        assert_eq!(key.as_bytes().len(), KEY_LEN);
    }

    #[test]
    fn test_derive_key_different_passwords() {
        let salt = generate_salt();
        let key1 = derive_key(b"password-one", &salt).unwrap();
        let key2 = derive_key(b"password-two", &salt).unwrap();
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }

    #[test]
    fn test_derive_key_different_salts() {
        let password = b"same-password";
        let salt1 = generate_salt();
        let salt2 = generate_salt();
        let key1 = derive_key(password, &salt1).unwrap();
        let key2 = derive_key(password, &salt2).unwrap();
        assert_ne!(key1.as_bytes(), key2.as_bytes());
    }
}
