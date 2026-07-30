/**
 * @localvault/importers — Google & Apple CSV (REQ-018, REQ-019, ADR-008).
 */

export type ImportSource = "google" | "apple";

export interface ImportRow {
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
}

export function detectCsvSource(headerLine: string): ImportSource | null {
  const h = headerLine.toLowerCase().replace(/^\uFEFF/, "");
  if (!h.includes("url") || !h.includes("username") || !h.includes("password")) {
    return null;
  }
  if (h.includes("title") || h.includes("otpauth")) return "apple";
  if (h.includes("name") || h.includes("note")) return "google";
  return "google";
}

/** Minimal RFC4180-ish CSV line parser. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function indexMap(headers: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  headers.forEach((h, i) => {
    m[h.trim().toLowerCase()] = i;
  });
  return m;
}

function cell(cols: string[], map: Record<string, number>, ...names: string[]): string {
  for (const n of names) {
    const i = map[n];
    if (i !== undefined && cols[i] !== undefined) return cols[i]!.trim();
  }
  return "";
}

export function parseGoogleCsv(text: string): ImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const map = indexMap(parseCsvLine(lines[0]!));
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const password = cell(cols, map, "password");
    if (!password) continue;
    rows.push({
      title: cell(cols, map, "name", "title") || cell(cols, map, "url") || "Imported",
      url: cell(cols, map, "url"),
      username: cell(cols, map, "username"),
      password,
      notes: cell(cols, map, "note", "notes") || undefined,
    });
  }
  return rows;
}

export function parseAppleCsv(text: string): ImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const map = indexMap(parseCsvLine(lines[0]!));
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]!);
    const password = cell(cols, map, "password");
    if (!password) continue;
    rows.push({
      title: cell(cols, map, "title", "name") || cell(cols, map, "url") || "Imported",
      url: cell(cols, map, "url"),
      username: cell(cols, map, "username"),
      password,
      notes: cell(cols, map, "notes", "note") || undefined,
    });
  }
  return rows;
}

export function parsePasswordCsv(text: string): { source: ImportSource; rows: ImportRow[] } {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim()) || "";
  const source = detectCsvSource(first);
  if (!source) throw new Error("Unrecognized password CSV (need Google or Apple headers)");
  const rows = source === "apple" ? parseAppleCsv(text) : parseGoogleCsv(text);
  return { source, rows };
}
