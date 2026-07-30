mod biometrics;
mod secure_store;

use biometrics::BiometricStatus;

#[tauri::command]
fn secure_store_set(key: String, value: String) -> Result<(), String> {
    secure_store::set(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_store_get(key: String) -> Result<Option<String>, String> {
    secure_store::get(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_store_delete(key: String) -> Result<(), String> {
    secure_store::delete(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn biometric_status() -> BiometricStatus {
    biometrics::status()
}

#[tauri::command]
fn biometric_unlock(reason: String) -> bool {
    biometrics::unlock(&reason)
}

#[tauri::command]
fn platform_label() -> String {
    biometrics::platform_label()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            secure_store_set,
            secure_store_get,
            secure_store_delete,
            biometric_status,
            biometric_unlock,
            platform_label
        ])
        .run(tauri::generate_context!())
        .expect("error while running LocalVault desktop");
}
