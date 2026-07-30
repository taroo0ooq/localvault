/** Typed wrappers around Tauri commands (no-op stubs in pure web/vite test). */

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  method: string;
  platform: string;
}

export async function isTauri(): Promise<boolean> {
  return Boolean(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__TAURI_INTERNALS__ ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).__TAURI__,
  );
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv<T>(cmd, args);
}

export async function secureStoreSet(key: string, value: string): Promise<void> {
  if (!(await isTauri())) {
    localStorage.setItem(`lv.secure.${key}`, value);
    return;
  }
  await invoke("secure_store_set", { key, value });
}

export async function secureStoreGet(key: string): Promise<string | null> {
  if (!(await isTauri())) {
    return localStorage.getItem(`lv.secure.${key}`);
  }
  return invoke<string | null>("secure_store_get", { key });
}

export async function secureStoreDelete(key: string): Promise<void> {
  if (!(await isTauri())) {
    localStorage.removeItem(`lv.secure.${key}`);
    return;
  }
  await invoke("secure_store_delete", { key });
}

export async function biometricStatus(): Promise<BiometricStatus> {
  if (!(await isTauri())) {
    return {
      available: false,
      enrolled: false,
      method: "none",
      platform: "web-preview",
    };
  }
  return invoke<BiometricStatus>("biometric_status");
}

export async function biometricUnlock(reason: string): Promise<boolean> {
  if (!(await isTauri())) return false;
  return invoke<boolean>("biometric_unlock", { reason });
}

export async function platformLabel(): Promise<string> {
  if (!(await isTauri())) return "browser";
  return invoke<string>("platform_label");
}
