/**
 * @localvault/importers — S1 scaffold.
 * Google/Apple CSV parsers arrive in S3 (REQ-018, REQ-019).
 */

export type ImportSource = "google" | "apple";

export interface ImportRow {
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
}

/** Detect source from header line — real parsers in S3. */
export function detectCsvSource(headerLine: string): ImportSource | null {
  const h = headerLine.toLowerCase();
  if (h.includes("url") && h.includes("username") && h.includes("password")) {
    if (h.includes("title") || h.includes("otpauth")) return "apple";
    if (h.includes("name") || h.includes("note")) return "google";
    return "google";
  }
  return null;
}
