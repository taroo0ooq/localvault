import type { VaultItemPlain } from "@localvault/crypto";

export type ExtMessage =
  | { type: "PING" }
  | { type: "GET_STATUS" }
  | { type: "CONNECT"; baseUrl: string }
  | { type: "UNLOCK"; pin: string; username: string }
  | { type: "LOCK" }
  | { type: "LIST_ITEMS" }
  | { type: "MATCH_ITEMS"; origin: string }
  | { type: "SAVE_ITEM"; item: VaultItemPlain }
  | { type: "GENERATE_PASSWORD"; length?: number }
  | { type: "GET_SESSION" }
  | { type: "CONTENT_AUTOSAVE_OFFER"; candidate: { origin: string; title: string; username: string; password: string; url: string } }
  | { type: "FILL_RESULT"; ok: boolean };

export type ExtResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export interface SessionStatus {
  connected: boolean;
  baseUrl: string;
  username: string | null;
  unlocked: boolean;
  itemCount: number;
}
