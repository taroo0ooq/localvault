import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Fingerprint,
  Lock,
  LogOut,
  Plus,
  Server,
  KeyRound,
} from "lucide-react";
import { VaultClient } from "@localvault/api-client";
import {
  decryptItem,
  encryptItem,
  enrollVaultCrypto,
  unlockWithPin,
  type VaultItemPlain,
} from "@localvault/crypto";
import { isValidUsername } from "@localvault/shared-types";
import {
  biometricStatus,
  biometricUnlock,
  platformLabel,
  secureStoreGet,
  secureStoreSet,
  type BiometricStatus,
} from "./tauri";
import { pickDesktopArgonProfile } from "./platform";

type Screen = "connect" | "enroll" | "unlock" | "vault";

interface DecryptedItem extends VaultItemPlain {
  id: string;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("connect");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8443");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState("");
  const [bio, setBio] = useState<BiometricStatus | null>(null);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [recovery, setRecovery] = useState("");
  const [token, setToken] = useState("");
  const [dek, setDek] = useState<Uint8Array | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [form, setForm] = useState<VaultItemPlain>({
    title: "",
    url: "",
    username: "",
    password: "",
  });

  useEffect(() => {
    void (async () => {
      setPlatform(await platformLabel());
      setBio(await biometricStatus());
      const savedUrl = await secureStoreGet("baseUrl");
      const savedUser = await secureStoreGet("username");
      const savedToken = await secureStoreGet("sessionToken");
      if (savedUrl) setBaseUrl(savedUrl);
      if (savedUser) setUsername(savedUser);
      if (savedToken) {
        setToken(savedToken);
        setScreen("unlock");
      }
    })();
  }, []);

  const client = useMemo(
    () => new VaultClient(baseUrl, token || undefined),
    [baseUrl, token],
  );

  async function refreshItems(c: VaultClient, key: Uint8Array) {
    const raw = await c.listItems();
    const out: DecryptedItem[] = [];
    for (const it of raw) {
      try {
        const plain = await decryptItem(key, it.ciphertext, it.nonce, it.aad || "item");
        out.push({ id: it.id, ...JSON.parse(plain) });
      } catch {
        /* skip */
      }
    }
    setItems(out);
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await new VaultClient(baseUrl).serverInfo();
      await secureStoreSet("baseUrl", baseUrl);
      setScreen(token ? "unlock" : "enroll");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!isValidUsername(username) || pin.length < 6 || pin !== pin2) return;
    setBusy(true);
    setError("");
    try {
      const mat = await enrollVaultCrypto(pin, pickDesktopArgonProfile());
      setRecovery(mat.recoveryPassphrase);
      // device key via WebCrypto ed25519
      const kp = (await crypto.subtle.generateKey("Ed25519", true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
      let b64 = "";
      for (const x of raw) b64 += String.fromCharCode(x);
      const pub = btoa(b64);
      const reg = await new VaultClient(baseUrl).register({
        username,
        device_name: `desktop-${platform || "app"}`,
        device_public_key: pub,
        kdf_params_json: mat.kdf_params_json,
        wrapped_dek_pin: mat.wrapped_dek_pin,
        wrapped_dek_recovery: mat.wrapped_dek_recovery,
      });
      setToken(reg.session_token);
      await secureStoreSet("sessionToken", reg.session_token);
      await secureStoreSet("username", reg.username);
      await secureStoreSet("deviceId", reg.device_id);
      // Store opaque unlock hint for biometric re-entry path (not PIN)
      await secureStoreSet("bioEnabled", bio?.available ? "1" : "0");
      setDek(mat.dek);
      await refreshItems(new VaultClient(baseUrl, reg.session_token), mat.dek);
      setScreen("vault");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithPinCode() {
    setBusy(true);
    setError("");
    try {
      const c = new VaultClient(baseUrl, token);
      const meta = await c.getVaultMeta();
      const key = await unlockWithPin(pin, meta.kdf_params_json, meta.wrapped_dek_pin);
      setDek(key);
      await refreshItems(c, key);
      setScreen("vault");
    } catch {
      setError("Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithBiometrics() {
    setBusy(true);
    setError("");
    try {
      const ok = await biometricUnlock("Unlock LocalVault");
      if (!ok) {
        setError("Biometric authentication failed or cancelled");
        return;
      }
      // After OS biometric gate, still need PIN-derived DEK — desktop stores
      // session only; user must have unlocked once with PIN this session OR we
      // require PIN after bio as second factor when no in-memory DEK.
      // Policy: biometrics gate access to the PIN prompt auto-submit if pin cached in OS keychain under bio protection (future).
      // S6: biometric success focuses PIN field / confirms device presence then requires PIN.
      setError("");
      // Mark bio gate passed — if pin already typed, unlock
      if (pin.length >= 6) {
        await unlockWithPinCode();
      } else {
        setError("Biometrics OK — enter PIN to derive vault keys (zero-knowledge)");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Biometrics error");
    } finally {
      setBusy(false);
    }
  }

  async function addItem() {
    if (!dek || !form.password) return;
    setBusy(true);
    try {
      const c = new VaultClient(baseUrl, token);
      const enc = await encryptItem(dek, JSON.stringify(form), "item");
      await c.createItem(enc.ciphertext, enc.nonce, enc.aad);
      setForm({ title: "", url: "", username: "", password: "" });
      await refreshItems(c, dek);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    setDek(null);
    setItems([]);
    setPin("");
    setScreen("unlock");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Shield className="size-5" />
          </div>
          <div>
            <div className="font-semibold">LocalVault Desktop</div>
            <div className="text-xs text-muted">
              {platform || "desktop"} · S6
              {bio?.available ? ` · ${bio.method}` : ""}
            </div>
          </div>
        </div>
        {dek && (
          <button
            type="button"
            onClick={lock}
            className="rounded-lg border border-border p-2 text-muted"
            aria-label="Lock"
          >
            <LogOut className="size-4" />
          </button>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {screen === "connect" && (
        <Panel title="Connect" icon={<Server className="size-5 text-primary" />}>
          <p className="mb-3 text-sm text-muted">
            LAN or tunnel URL for your Docker vault host.
          </p>
          <input
            className="mb-3 w-full rounded-xl border border-border bg-bg px-3 py-3 font-mono text-sm"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            data-testid="desktop-base-url"
          />
          <Primary onClick={() => void connect()} disabled={busy}>
            {busy ? "Connecting…" : "Connect"}
          </Primary>
        </Panel>
      )}

      {screen === "enroll" && (
        <Panel title="Register" icon={<KeyRound className="size-5 text-primary" />}>
          <p className="mb-2 text-xs text-accent">
            Order: username → PIN → recovery (desktop Argon2id profile)
          </p>
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            testId="desktop-username"
          />
          <Field label="PIN" value={pin} onChange={setPin} type="password" testId="desktop-pin" />
          <Field
            label="Confirm PIN"
            value={pin2}
            onChange={setPin2}
            type="password"
            testId="desktop-pin2"
          />
          <Primary
            disabled={busy || !isValidUsername(username) || pin.length < 6 || pin !== pin2}
            onClick={() => void register()}
          >
            {busy ? "Registering…" : "Create account"}
          </Primary>
          {recovery && (
            <div className="mt-3 rounded-xl border border-accent/30 bg-bg p-3 font-mono text-xs">
              Recovery (save offline): {recovery}
            </div>
          )}
          <button
            type="button"
            className="mt-3 text-xs text-accent"
            onClick={() => setScreen("unlock")}
          >
            Already registered? Unlock
          </button>
        </Panel>
      )}

      {screen === "unlock" && (
        <Panel title="Unlock" icon={<Lock className="size-5 text-primary" />}>
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            testId="desktop-unlock-user"
          />
          <Field
            label="Session token (from prior login)"
            value={token}
            onChange={setToken}
            type="password"
            testId="desktop-token"
          />
          <Field
            label="PIN"
            value={pin}
            onChange={setPin}
            type="password"
            testId="desktop-unlock-pin"
          />
          <Primary disabled={busy || pin.length < 6} onClick={() => void unlockWithPinCode()}>
            Unlock with PIN
          </Primary>
          {bio?.available && (
            <button
              type="button"
              data-testid="desktop-bio"
              disabled={busy}
              onClick={() => void unlockWithBiometrics()}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary"
            >
              <Fingerprint className="size-4" />
              {bio.method || "Biometrics"}
            </button>
          )}
          <button
            type="button"
            className="mt-3 text-xs text-accent"
            onClick={() => setScreen("enroll")}
          >
            Create new account
          </button>
        </Panel>
      )}

      {screen === "vault" && dek && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Vault</h2>
            <span className="text-xs text-muted">@{username}</span>
          </div>
          <div className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-4">
            {(["title", "url", "username", "password"] as const).map((f) => (
              <input
                key={f}
                placeholder={f}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
              />
            ))}
            <Primary disabled={busy || !form.password} onClick={() => void addItem()}>
              <Plus className="size-4" /> Save encrypted
            </Primary>
          </div>
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-xl border border-border bg-surface px-4 py-3"
                data-testid="desktop-item"
              >
                <div className="font-medium">{it.title || it.url}</div>
                <div className="text-xs text-muted">{it.username}</div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-center text-sm text-muted">No items yet</li>
            )}
          </ul>
        </div>
      )}
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
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h1 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h1>
      {children}
    </section>
  );
}

function Primary({
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  testId?: string;
}) {
  return (
    <label className="mb-3 block text-sm font-medium">
      {label}
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm"
      />
    </label>
  );
}
