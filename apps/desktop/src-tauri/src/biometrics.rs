//! Platform biometric availability + unlock gate (S6).
pub use localvault_desktop_core::{
    biometric_status as status, biometric_unlock_supported, platform_label, BiometricStatus,
};

pub fn unlock(reason: &str) -> bool {
    let _ = reason;
    biometric_unlock_supported(std::env::consts::OS) && status().available
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_has_platform() {
        let s = status();
        assert!(!s.platform.is_empty());
    }
}
