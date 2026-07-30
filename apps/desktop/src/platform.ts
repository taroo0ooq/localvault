/** Desktop always prefers the higher-memory Argon2id profile (REQ-015). */
export function pickDesktopArgonProfile(): "desktop_pin" {
  return "desktop_pin";
}
