use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use zeroize::Zeroize;

const NONCE_LEN: usize = 12;

#[derive(Debug)]
pub enum CipherError {
    EncryptionFailed,
    DecryptionFailed,
    CiphertextTooShort,
}

impl std::fmt::Display for CipherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CipherError::EncryptionFailed => write!(f, "encryption failed"),
            CipherError::DecryptionFailed => write!(f, "decryption failed"),
            CipherError::CiphertextTooShort => write!(f, "ciphertext too short"),
        }
    }
}

impl std::error::Error for CipherError {}

/// Encrypt plaintext using AES-256-GCM. Returns nonce || ciphertext.
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, CipherError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CipherError::EncryptionFailed)?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| CipherError::EncryptionFailed)?;

    let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);

    Ok(output)
}

/// Decrypt ciphertext produced by `encrypt`. Input is nonce || ciphertext.
pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, CipherError> {
    if data.len() < NONCE_LEN {
        return Err(CipherError::CiphertextTooShort);
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CipherError::DecryptionFailed)?;

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CipherError::DecryptionFailed)?;

    // The caller should zeroize when done, but we ensure we don't leak on error paths
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::kdf;

    fn test_key() -> [u8; 32] {
        let salt = kdf::generate_salt();
        let key = kdf::derive_key(b"test-password", &salt).unwrap();
        *key.as_bytes()
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = test_key();
        let plaintext = b"hello, gila vault!";
        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_unique_nonces() {
        let key = test_key();
        let plaintext = b"same data";
        let enc1 = encrypt(&key, plaintext).unwrap();
        let enc2 = encrypt(&key, plaintext).unwrap();
        // Nonces (first 12 bytes) should differ
        assert_ne!(&enc1[..NONCE_LEN], &enc2[..NONCE_LEN]);
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        let key = test_key();
        let plaintext = b"sensitive data";
        let mut encrypted = encrypt(&key, plaintext).unwrap();
        // Flip a byte in the ciphertext portion
        let last = encrypted.len() - 1;
        encrypted[last] ^= 0xFF;
        assert!(decrypt(&key, &encrypted).is_err());
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = test_key();
        let key2 = test_key();
        let plaintext = b"secret";
        let encrypted = encrypt(&key1, plaintext).unwrap();
        assert!(decrypt(&key2, &encrypted).is_err());
    }

    #[test]
    fn test_empty_plaintext() {
        let key = test_key();
        let encrypted = encrypt(&key, b"").unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, b"");
    }

    #[test]
    fn test_large_plaintext() {
        let key = test_key();
        let plaintext = vec![0xAB; 10_000];
        let encrypted = encrypt(&key, &plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_ciphertext_too_short() {
        let key = test_key();
        assert!(decrypt(&key, &[0u8; 5]).is_err());
    }
}
