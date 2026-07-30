//! Desktop core helpers shared by the Tauri shell (S6).
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BiometricStatus {
    pub available: bool,
    pub enrolled: bool,
    pub method: String,
    pub platform: String,
}

pub fn platform_label() -> String {
    std::env::consts::OS.to_string()
}

pub fn biometric_status_for(os: &str) -> BiometricStatus {
    match os {
        "macos" => BiometricStatus {
            available: true,
            enrolled: true,
            method: "Touch ID / Face ID".into(),
            platform: "macos".into(),
        },
        "windows" => BiometricStatus {
            available: true,
            enrolled: true,
            method: "Windows Hello".into(),
            platform: "windows".into(),
        },
        other => BiometricStatus {
            available: false,
            enrolled: false,
            method: "none".into(),
            platform: other.into(),
        },
    }
}

pub fn biometric_status() -> BiometricStatus {
    biometric_status_for(std::env::consts::OS)
}

/// Biometric unlock gate — host OS integration lives in Tauri binary.
pub fn biometric_unlock_supported(os: &str) -> bool {
    matches!(os, "macos" | "windows")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn macos_reports_touch_id() {
        let s = biometric_status_for("macos");
        assert!(s.available);
        assert!(s.method.contains("Touch ID"));
    }

    #[test]
    fn windows_reports_hello() {
        let s = biometric_status_for("windows");
        assert!(s.available);
        assert!(s.method.contains("Hello"));
    }

    #[test]
    fn linux_pin_only() {
        let s = biometric_status_for("linux");
        assert!(!s.available);
    }

    #[test]
    fn unlock_supported_matrix() {
        assert!(biometric_unlock_supported("macos"));
        assert!(biometric_unlock_supported("windows"));
        assert!(!biometric_unlock_supported("linux"));
    }
}
