use gila_lib::crypto::{decrypt, derive_key, encrypt, generate_salt};

#[test]
fn test_full_pipeline_roundtrip() {
    let password = b"my-master-password-2024!";
    let salt = generate_salt();
    let key = derive_key(password, &salt).unwrap();

    let plaintext = b"gmail:user@example.com:s3cretP@ss";
    let ciphertext = encrypt(key.as_bytes(), plaintext).unwrap();
    let decrypted = decrypt(key.as_bytes(), &ciphertext).unwrap();

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_wrong_password_fails_decryption() {
    let salt = generate_salt();

    let correct_key = derive_key(b"correct-password", &salt).unwrap();
    let wrong_key = derive_key(b"wrong-password", &salt).unwrap();

    let plaintext = b"sensitive credential data";
    let ciphertext = encrypt(correct_key.as_bytes(), plaintext).unwrap();

    assert!(decrypt(wrong_key.as_bytes(), &ciphertext).is_err());
}

#[test]
fn test_corrupted_ciphertext_detected() {
    let password = b"test-password";
    let salt = generate_salt();
    let key = derive_key(password, &salt).unwrap();

    let plaintext = b"important secret";
    let mut ciphertext = encrypt(key.as_bytes(), plaintext).unwrap();

    // Corrupt a byte in the middle
    let mid = ciphertext.len() / 2;
    ciphertext[mid] ^= 0xFF;

    assert!(decrypt(key.as_bytes(), &ciphertext).is_err());
}

#[test]
fn test_empty_plaintext_roundtrip() {
    let password = b"password";
    let salt = generate_salt();
    let key = derive_key(password, &salt).unwrap();

    let ciphertext = encrypt(key.as_bytes(), b"").unwrap();
    let decrypted = decrypt(key.as_bytes(), &ciphertext).unwrap();

    assert_eq!(decrypted, b"");
}

#[test]
fn test_large_payload_roundtrip() {
    let password = b"password";
    let salt = generate_salt();
    let key = derive_key(password, &salt).unwrap();

    // Simulate a large secure note (~100KB)
    let plaintext = "A".repeat(100_000);
    let ciphertext = encrypt(key.as_bytes(), plaintext.as_bytes()).unwrap();
    let decrypted = decrypt(key.as_bytes(), &ciphertext).unwrap();

    assert_eq!(decrypted, plaintext.as_bytes());
}

#[test]
fn test_different_salts_produce_incompatible_keys() {
    let password = b"same-password";
    let salt1 = generate_salt();
    let salt2 = generate_salt();
    let key1 = derive_key(password, &salt1).unwrap();
    let key2 = derive_key(password, &salt2).unwrap();

    let plaintext = b"vault entry";
    let ciphertext = encrypt(key1.as_bytes(), plaintext).unwrap();

    // key2 should fail to decrypt data encrypted with key1
    assert!(decrypt(key2.as_bytes(), &ciphertext).is_err());
}

#[test]
fn test_json_credential_roundtrip() {
    let password = b"master-password";
    let salt = generate_salt();
    let key = derive_key(password, &salt).unwrap();

    let credential_json = serde_json::json!({
        "type": "login",
        "service": "GitHub",
        "url": "https://github.com",
        "username": "user@example.com",
        "password": "gh-p@ssw0rd!"
    });

    let plaintext = serde_json::to_vec(&credential_json).unwrap();
    let ciphertext = encrypt(key.as_bytes(), &plaintext).unwrap();
    let decrypted = decrypt(key.as_bytes(), &ciphertext).unwrap();

    let parsed: serde_json::Value = serde_json::from_slice(&decrypted).unwrap();
    assert_eq!(parsed, credential_json);
}
