import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Shield,
  KeyRound,
  Download,
  LogOut,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  RefreshCw,
  Server,
  UserPlus,
  Lock,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
} from "lucide-react";
import { VaultClient } from "@localvault/api-client";
import {
  decryptItem,
  encryptItem,
  enrollVaultCrypto,
  generatePassword,
  unlockWithPin,
  unlockWithRecovery,
  type VaultItemPlain,
  DEFAULT_POLICY,
} from "@localvault/crypto";
import { parsePasswordCsv } from "@localvault/importers";
import { isValidUsername } from "@localvault/shared-types";
import {
  clearSession,
  loadSession,
  saveSession,
  type DecryptedItem,
  type Screen,
  type StoredSession,
} from "./lib/session";
import { getOrCreateDeviceKey } from "./lib/device-keys";

type EnrollStep = "username" | "pin" | "recovery" | "registering" | "done";

export function App() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [baseUrl, setBaseUrl] = useState(() => {
    const saved = localStorage.getItem("localvault.baseUrl");
    if (saved) return saved;
    const env = (import.meta as { env?: { VITE_VAULT_URL?: string } }).env?.VITE_VAULT_URL;
    if (env) return env;
    return "http://127.0.0.1:8443";
  });
  const [serverLabel, setServerLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [session, setSession] = useState<StoredSession | null>(() => loadSession());
  const [dek, setDek] = useState<Uint8Array | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);

  // enroll state
  const [enrollStep, setEnrollStep] = useState<EnrollStep>("username");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [recovery, setRecovery] = useState("");
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [webauthnNote, setWebauthnNote] = useState("");

  // unlock
  const [unlockPin, setUnlockPin] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [unlockSecret, setUnlockSecret] = useState("");

  // vault form
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<VaultItemPlain>({
    title: "",
    url: "",
    username: "",
    password: "",
    notes: "",
  });
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // generator
  const [genLen, setGenLen] = useState(20);
  const [genPw, setGenPw] = useState(() => generatePassword({ ...DEFAULT_POLICY, length: 20 }));

  // import
  const [importPreview, setImportPreview] = useState<
    { source: string; rows: VaultItemPlain[] } | null
  >(null);

  const client = useMemo(
    () => new VaultClient(baseUrl, session?.token),
    [baseUrl, session?.token],
  );

  useEffect(() => {
    if (session && !dek) setScreen("unlock");
    else if (session && dek) setScreen("vault");
  }, [session, dek]);

  const connect = async () => {
    setError("");
    setBusy(true);
    try {
      const info = await new VaultClient(baseUrl).serverInfo();
      localStorage.setItem("localvault.baseUrl", baseUrl);
      setServerLabel(`${info.name} ${info.version} · ${info.stage}`);
      if (session) setScreen(dek ? "vault" : "unlock");
      else setScreen("welcome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot reach vault host");
    } finally {
      setBusy(false);
    }
  };

  const refreshItems = useCallback(async (c: VaultClient, key: Uint8Array) => {
    const raw = await c.listItems();
    const out: DecryptedItem[] = [];
    for (const it of raw) {
      try {
        const plain = await decryptItem(key, it.ciphertext, it.nonce, it.aad || "item");
        const parsed = JSON.parse(plain) as VaultItemPlain;
        out.push({ id: it.id, ...parsed });
      } catch {
        /* skip undecryptable */
      }
    }
    setItems(out);
  }, []);

  const finishEnroll = async () => {
    if (!recoverySaved) return;
    setBusy(true);
    setError("");
    setEnrollStep("registering");
    try {
      const cryptoMat = await enrollVaultCrypto(pin);
      setRecovery(cryptoMat.recoveryPassphrase);
      const device = await getOrCreateDeviceKey();
      const reg = await new VaultClient(baseUrl).register({
        username: username.toLowerCase(),
        device_name: navigator.userAgent.slice(0, 48) || "web",
        device_public_key: device.publicKeyB64,
        kdf_params_json: cryptoMat.kdf_params_json,
        wrapped_dek_pin: cryptoMat.wrapped_dek_pin,
        wrapped_dek_recovery: cryptoMat.wrapped_dek_recovery,
      });
      const s: StoredSession = {
        baseUrl,
        username: reg.username,
        deviceId: reg.device_id,
        token: reg.session_token,
      };
      saveSession(s);
      setSession(s);
      setDek(cryptoMat.dek);
      setEnrollStep("done");

      // Optional WebAuthn platform probe (REQ-017) — non-blocking
      if (window.PublicKeyCredential) {
        setWebauthnNote(
          "This device supports WebAuthn. Full passkey unlock lands in a follow-up polish; PIN works now.",
        );
      }

      await refreshItems(new VaultClient(baseUrl, reg.session_token), cryptoMat.dek);
      setScreen("vault");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setEnrollStep("recovery");
    } finally {
      setBusy(false);
    }
  };

  // When moving to recovery step, generate crypto material display
  const goToRecovery = async () => {
    if (pin.length < 6 || pin !== pin2) return;
    setBusy(true);
    setError("");
    try {
      // Generate only for display; full enroll re-runs on finish (same PIN)
      const preview = await enrollVaultCrypto(pin);
      setRecovery(preview.recoveryPassphrase);
      setRecoverySaved(false);
      setEnrollStep("recovery");
      // Stash preview on window for finish to avoid double different recovery
      (window as unknown as { __lvEnroll?: typeof preview }).__lvEnroll = preview;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate recovery");
    } finally {
      setBusy(false);
    }
  };

  const finishEnrollFixed = async () => {
    if (!recoverySaved) return;
    const preview = (window as unknown as { __lvEnroll?: Awaited<ReturnType<typeof enrollVaultCrypto>> })
      .__lvEnroll;
    if (!preview) {
      await finishEnroll();
      return;
    }
    setBusy(true);
    setError("");
    setEnrollStep("registering");
    try {
      const device = await getOrCreateDeviceKey();
      const reg = await new VaultClient(baseUrl).register({
        username: username.toLowerCase(),
        device_name: "web-browser",
        device_public_key: device.publicKeyB64,
        kdf_params_json: preview.kdf_params_json,
        wrapped_dek_pin: preview.wrapped_dek_pin,
        wrapped_dek_recovery: preview.wrapped_dek_recovery,
      });
      const s: StoredSession = {
        baseUrl,
        username: reg.username,
        deviceId: reg.device_id,
        token: reg.session_token,
      };
      saveSession(s);
      setSession(s);
      setDek(preview.dek);
      setRecovery(preview.recoveryPassphrase);
      if (window.PublicKeyCredential) {
        setWebauthnNote("WebAuthn available — passkey unlock can be enabled later; PIN unlock works.");
      }
      await refreshItems(new VaultClient(baseUrl, reg.session_token), preview.dek);
      setScreen("vault");
      delete (window as unknown as { __lvEnroll?: unknown }).__lvEnroll;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setEnrollStep("recovery");
    } finally {
      setBusy(false);
    }
  };

  const doUnlock = async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const c = new VaultClient(session.baseUrl, session.token);
      const meta = await c.getVaultMeta();
      let key: Uint8Array;
      if (useRecovery) {
        key = await unlockWithRecovery(
          unlockSecret,
          meta.kdf_params_json,
          meta.wrapped_dek_recovery,
        );
      } else {
        key = await unlockWithPin(unlockPin, meta.kdf_params_json, meta.wrapped_dek_pin);
      }
      setDek(key);
      await refreshItems(c, key);
      setScreen("vault");
    } catch {
      setError("Unlock failed — check PIN or recovery phrase");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async () => {
    if (!dek || !session || !form.password) return;
    setBusy(true);
    setError("");
    try {
      const c = new VaultClient(session.baseUrl, session.token);
      const plain = JSON.stringify(form);
      const enc = await encryptItem(dek, plain, "item");
      await c.createItem(enc.ciphertext, enc.nonce, enc.aad);
      setForm({ title: "", url: "", username: "", password: "", notes: "" });
      setShowNew(false);
      await refreshItems(c, dek);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!dek || !session) return;
    const c = new VaultClient(session.baseUrl, session.token);
    await c.deleteItem(id);
    await refreshItems(c, dek);
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    try {
      const { source, rows } = parsePasswordCsv(text);
      setImportPreview({ source, rows });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
    }
  };

  const commitImport = async () => {
    if (!importPreview || !dek || !session) return;
    setBusy(true);
    try {
      const c = new VaultClient(session.baseUrl, session.token);
      for (const row of importPreview.rows) {
        const enc = await encryptItem(dek, JSON.stringify(row), "item");
        await c.createItem(enc.ciphertext, enc.nonce, enc.aad);
      }
      setImportPreview(null);
      await refreshItems(c, dek);
      setScreen("vault");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    setDek(null);
    setItems([]);
    setUnlockPin("");
    setUnlockSecret("");
    setScreen("unlock");
  };

  const signOut = () => {
    clearSession();
    setSession(null);
    setDek(null);
    setItems([]);
    setScreen("welcome");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-6 sm:max-w-xl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Shield className="size-5" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">LocalVault</div>
            <div className="text-xs text-muted">
              {session ? `@${session.username}` : "Local · multiuser"}
            </div>
          </div>
        </div>
        {dek && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={lock}
              className="rounded-lg border border-border px-2.5 py-2 text-xs text-muted"
            >
              Lock
            </button>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-border p-2 text-muted"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 flex gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {screen === "connect" && (
        <Panel title="Connect to vault host" icon={<Server className="size-5 text-primary" />}>
          <p className="mb-4 text-sm text-muted">
            Your Docker Desktop vault (LAN or tunnel URL). Example:{" "}
            <code className="font-mono text-xs text-accent">http://127.0.0.1:8443</code>
          </p>
          <label className="mb-3 block text-sm font-medium">
            Vault URL
            <input
              data-testid="base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
            />
          </label>
          <PrimaryButton disabled={busy} onClick={() => void connect()}>
            {busy ? "Connecting…" : "Connect"}
          </PrimaryButton>
        </Panel>
      )}

      {screen === "welcome" && (
        <Panel title="Welcome" icon={<KeyRound className="size-5 text-primary" />}>
          <p className="mb-2 text-sm text-muted">{serverLabel}</p>
          <p className="mb-4 text-sm text-muted">
            Registration order is locked:{" "}
            <strong className="text-fg">username → PIN → recovery passphrase</strong>.
          </p>
          <div className="flex flex-col gap-2">
            <PrimaryButton
              onClick={() => {
                setEnrollStep("username");
                setScreen("enroll");
              }}
            >
              <UserPlus className="size-4" /> Create account
            </PrimaryButton>
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-3 text-sm text-muted"
              onClick={() => setScreen("connect")}
            >
              Change host
            </button>
            {session && (
              <button
                type="button"
                className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
                onClick={() => setScreen("unlock")}
              >
                Unlock @{session.username}
              </button>
            )}
          </div>
        </Panel>
      )}

      {screen === "enroll" && (
        <Panel title="Register" icon={<UserPlus className="size-5 text-primary" />}>
          <StepPills step={enrollStep} />

          {enrollStep === "username" && (
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Simple username
                <input
                  data-testid="enroll-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                  placeholder="tareq"
                  autoComplete="username"
                />
              </label>
              <p className="text-xs text-muted">3–32 chars · a–z 0-9 _ - . · not an email</p>
              <PrimaryButton
                disabled={!isValidUsername(username)}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await new VaultClient(baseUrl).checkUsername(username);
                    if (!r.available) {
                      setError("Username taken on this host");
                      return;
                    }
                    setEnrollStep("pin");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Check failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue to PIN
              </PrimaryButton>
            </div>
          )}

          {enrollStep === "pin" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                User <span className="font-mono text-primary">{username}</span>
              </p>
              <label className="block text-sm font-medium">
                PIN (min 6 digits)
                <input
                  data-testid="enroll-pin"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block text-sm font-medium">
                Confirm PIN
                <input
                  data-testid="enroll-pin2"
                  type="password"
                  inputMode="numeric"
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <PrimaryButton
                disabled={pin.length < 6 || pin !== pin2 || busy}
                onClick={() => void goToRecovery()}
              >
                {busy ? "Generating recovery…" : "Create PIN & generate recovery"}
              </PrimaryButton>
              <p className="text-xs text-accent">
                Recovery is generated only after PIN is confirmed.
              </p>
            </div>
          )}

          {enrollStep === "recovery" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Save this recovery passphrase offline. It will not be shown again.
              </p>
              <div
                data-testid="recovery-phrase"
                className="rounded-xl border border-accent/30 bg-bg px-4 py-4 font-mono text-sm leading-relaxed"
              >
                {recovery}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
                onClick={() => void navigator.clipboard.writeText(recovery)}
              >
                <Copy className="size-3.5" /> Copy
              </button>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-muted">
                <input
                  data-testid="recovery-confirm"
                  type="checkbox"
                  className="mt-1"
                  checked={recoverySaved}
                  onChange={(e) => setRecoverySaved(e.target.checked)}
                />
                I saved this recovery passphrase for <span className="font-mono text-fg">{username}</span>
              </label>
              <PrimaryButton
                disabled={!recoverySaved || busy}
                onClick={() => void finishEnrollFixed()}
              >
                {busy ? "Registering…" : "Finish registration"}
              </PrimaryButton>
            </div>
          )}

          {enrollStep === "registering" && (
            <p className="text-sm text-muted">Encrypting vault keys and registering…</p>
          )}
        </Panel>
      )}

      {screen === "unlock" && session && (
        <Panel title="Unlock vault" icon={<Lock className="size-5 text-primary" />}>
          <p className="mb-3 text-sm text-muted">
            Signed in as <span className="font-mono text-primary">@{session.username}</span>
          </p>
          {!useRecovery ? (
            <label className="mb-3 block text-sm font-medium">
              PIN
              <input
                data-testid="unlock-pin"
                type="password"
                inputMode="numeric"
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
              />
            </label>
          ) : (
            <label className="mb-3 block text-sm font-medium">
              Recovery passphrase
              <input
                data-testid="unlock-recovery"
                value={unlockSecret}
                onChange={(e) => setUnlockSecret(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm outline-none focus:border-primary"
              />
            </label>
          )}
          <PrimaryButton disabled={busy} onClick={() => void doUnlock()}>
            {busy ? "Unlocking…" : "Unlock"}
          </PrimaryButton>
          <button
            type="button"
            className="mt-3 text-xs text-accent"
            onClick={() => setUseRecovery((v) => !v)}
          >
            {useRecovery ? "Use PIN instead" : "Use recovery passphrase"}
          </button>
          {webauthnNote && (
            <p className="mt-3 flex gap-2 text-xs text-muted">
              <Fingerprint className="size-3.5 shrink-0 text-primary" />
              {webauthnNote}
            </p>
          )}
        </Panel>
      )}

      {screen === "vault" && dek && (
        <>
          <nav className="mb-4 flex gap-1 rounded-xl border border-border bg-surface p-1">
            {(
              [
                ["vault", "Vault"],
                ["generator", "Generator"],
                ["import", "Import"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setScreen(id)}
                className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium ${
                  screen === id ? "bg-surface-2 text-fg" : "text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Passwords</h2>
            <button
              type="button"
              data-testid="add-item"
              onClick={() => setShowNew(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg"
            >
              <Plus className="size-4" /> Add
            </button>
          </div>

          {showNew && (
            <div className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-4">
              {(["title", "url", "username", "password"] as const).map((f) => (
                <input
                  key={f}
                  data-testid={`item-${f}`}
                  placeholder={f}
                  value={form[f]}
                  onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-primary"
                />
              ))}
              <div className="flex gap-2">
                <PrimaryButton disabled={busy || !form.password} onClick={() => void addItem()}>
                  Save encrypted
                </PrimaryButton>
                <button
                  type="button"
                  className="rounded-xl border border-border px-3 py-2 text-sm text-muted"
                  onClick={() => setShowNew(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              No items yet. Add one or import from Google / Apple.
            </div>
          )}

          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-2xl border border-border bg-surface px-4 py-3"
                data-testid="vault-item"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{it.title || it.url || "Item"}</div>
                    <div className="text-xs text-muted">{it.username}</div>
                    <div className="mt-1 font-mono text-sm">
                      {reveal[it.id] ? it.password : "••••••••"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn
                      label="Reveal"
                      onClick={() => setReveal((r) => ({ ...r, [it.id]: !r[it.id] }))}
                    >
                      {reveal[it.id] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </IconBtn>
                    <IconBtn
                      label="Copy"
                      onClick={() => void navigator.clipboard.writeText(it.password)}
                    >
                      <Copy className="size-4" />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => void removeItem(it.id)}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {screen === "generator" && (
        <Panel title="Password generator" icon={<Sparkles className="size-5 text-primary" />}>
          <div
            data-testid="generated-password"
            className="mb-3 break-all rounded-xl border border-border bg-bg px-4 py-4 font-mono text-sm"
          >
            {genPw}
          </div>
          <label className="mb-3 block text-sm text-muted">
            Length: {genLen}
            <input
              type="range"
              min={12}
              max={48}
              value={genLen}
              onChange={(e) => {
                const length = Number(e.target.value);
                setGenLen(length);
                setGenPw(generatePassword({ ...DEFAULT_POLICY, length }));
              }}
              className="mt-2 w-full"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm"
              onClick={() => setGenPw(generatePassword({ ...DEFAULT_POLICY, length: genLen }))}
            >
              <RefreshCw className="size-4" /> Regenerate
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-fg"
              onClick={() => void navigator.clipboard.writeText(genPw)}
            >
              <Copy className="size-4" /> Copy
            </button>
          </div>
          <button
            type="button"
            className="mt-4 text-sm text-accent"
            onClick={() => setScreen("vault")}
          >
            ← Back to vault
          </button>
        </Panel>
      )}

      {screen === "import" && (
        <Panel title="Import passwords" icon={<Download className="size-5 text-primary" />}>
          <p className="mb-3 text-sm text-muted">
            Guided CSV from Google Password Manager or Apple Passwords. Parsed client-side, then
            encrypted into <strong className="text-fg">your</strong> vault only.
          </p>
          <input
            data-testid="import-file"
            type="file"
            accept=".csv,text/csv"
            className="mb-3 block w-full text-sm text-muted"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
            }}
          />
          {importPreview && (
            <div className="mb-3 rounded-xl border border-border bg-bg p-3 text-sm">
              <div className="mb-1 font-medium text-fg">
                {importPreview.source} · {importPreview.rows.length} rows
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {importPreview.rows.slice(0, 20).map((r, i) => (
                  <li key={i}>
                    {r.title} · {r.username}
                  </li>
                ))}
              </ul>
              <PrimaryButton disabled={busy || !dek} onClick={() => void commitImport()}>
                Encrypt & import {importPreview.rows.length} items
              </PrimaryButton>
            </div>
          )}
          <button
            type="button"
            className="text-sm text-accent"
            onClick={() => setScreen("vault")}
          >
            ← Back to vault
          </button>
        </Panel>
      )}

      <footer className="mt-auto pt-8 text-center text-[11px] text-muted">
        Zero-knowledge · S3 web client · enrollment order enforced
      </footer>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h1>
      {children}
    </section>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-lg border border-border p-2 text-muted hover:text-fg"
    >
      {children}
    </button>
  );
}

function StepPills({ step }: { step: EnrollStep }) {
  const steps = [
    ["username", "1 · Username"],
    ["pin", "2 · PIN"],
    ["recovery", "3 · Recovery"],
  ] as const;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {steps.map(([id, label]) => (
        <span
          key={id}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            step === id || (step === "registering" && id === "recovery")
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border text-muted"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
