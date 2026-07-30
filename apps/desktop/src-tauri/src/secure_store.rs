//! OS keychain / secret-service storage for session material (not DEK, not PIN plaintext).
use keyring::Entry;
use thiserror::Error;

const SERVICE: &str = "com.localvault.desktop";

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("keyring: {0}")]
    Keyring(String),
}

fn entry(key: &str) -> Result<Entry, StoreError> {
    Entry::new(SERVICE, key).map_err(|e| StoreError::Keyring(e.to_string()))
}

pub fn set(key: &str, value: &str) -> Result<(), StoreError> {
    entry(key)?
        .set_password(value)
        .map_err(|e| StoreError::Keyring(e.to_string()))
}

pub fn get(key: &str) -> Result<Option<String>, StoreError> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(StoreError::Keyring(e.to_string())),
    }
}

pub fn delete(key: &str) -> Result<(), StoreError> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(StoreError::Keyring(e.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_constant() {
        assert!(SERVICE.contains("localvault"));
    }
}
