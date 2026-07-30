package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/taroo0ooq/localvault/apps/vault-api/internal/auth"
	"github.com/taroo0ooq/localvault/apps/vault-api/internal/httpx"
	"github.com/taroo0ooq/localvault/apps/vault-api/internal/store"
	"github.com/taroo0ooq/localvault/apps/vault-api/internal/validate"
)

type API struct {
	Store *store.Store
}

type ctxKey int

const sessionKey ctxKey = 1

type SessionPrincipal struct {
	UserID   string
	DeviceID string
	Username string
}

func (a *API) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /{$}", a.root)
	mux.HandleFunc("GET /healthz", a.healthz)
	mux.HandleFunc("GET /v1/server-info", a.serverInfo)

	mux.HandleFunc("GET /v1/users/check", a.checkUsername)
	mux.HandleFunc("POST /v1/users/register", a.register)

	mux.HandleFunc("POST /v1/auth/challenge", a.challenge)
	mux.HandleFunc("POST /v1/auth/session", a.createSession)

	mux.HandleFunc("GET /v1/devices", a.auth(a.listDevices))
	mux.HandleFunc("POST /v1/devices", a.auth(a.pairDevice))

	mux.HandleFunc("GET /v1/vault/meta", a.auth(a.getVaultMeta))
	mux.HandleFunc("PUT /v1/vault/meta", a.auth(a.putVaultMeta))

	mux.HandleFunc("GET /v1/items", a.auth(a.listItems))
	mux.HandleFunc("POST /v1/items", a.auth(a.createItem))
	mux.HandleFunc("GET /v1/items/{id}", a.auth(a.getItem))
	mux.HandleFunc("PUT /v1/items/{id}", a.auth(a.updateItem))
	mux.HandleFunc("DELETE /v1/items/{id}", a.auth(a.deleteItem))
}

func (a *API) root(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{
		"service": "localvault-api",
		"docs":    "/v1/server-info",
		"health":  "/healthz",
	})
}

func (a *API) healthz(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "localvault-api",
		"stage":   "S8",
	})
}

func (a *API) serverInfo(w http.ResponseWriter, r *http.Request) {
	tunnelMode := os.Getenv("VAULT_TUNNEL_MODE") == "1" || strings.EqualFold(os.Getenv("VAULT_TUNNEL_MODE"), "true")
	publicURL := strings.TrimSpace(os.Getenv("VAULT_PUBLIC_BASE_URL"))
	httpx.JSON(w, http.StatusOK, map[string]any{
		"name":    "LocalVault",
		"version": "0.8.0-s8",
		"stage":   "S8",
		"features": map[string]bool{
			"multiuser":       true,
			"device_pairing":  true,
			"ciphertext_crud": true,
			"client_crypto":   true,
			"tunnel_access":   true,
			"hardening_s8":    true,
		},
		"access": map[string]any{
			"tunnel_mode":     tunnelMode,
			"public_base_url": publicURL,
			"bind_guidance":   "Use VAULT_PUBLISH=127.0.0.1:8443 when Cloudflare/ngrok is the public edge",
			"auth_note":       "Tunnel reachability does not unlock the vault; PIN/recovery still required",
		},
	})
}

func (a *API) checkUsername(w http.ResponseWriter, r *http.Request) {
	u := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("username")))
	if !validate.Username(u) {
		httpx.Error(w, http.StatusBadRequest, "invalid_username", "username must match 3-32 [a-z0-9._-]")
		return
	}
	taken, err := a.Store.UsernameTaken(r.Context(), u)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "lookup failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"username": u, "available": !taken})
}

type registerReq struct {
	Username           string `json:"username"`
	DisplayName        string `json:"display_name"`
	DeviceName         string `json:"device_name"`
	DevicePublicKey    string `json:"device_public_key"`
	KDFParamsJSON      string `json:"kdf_params_json"`
	WrappedDEKPIN      string `json:"wrapped_dek_pin"`
	WrappedDEKRecovery string `json:"wrapped_dek_recovery"`
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if !validate.Username(username) {
		httpx.Error(w, http.StatusBadRequest, "invalid_username", "username must match 3-32 [a-z0-9._-]")
		return
	}
	if strings.TrimSpace(req.DeviceName) == "" {
		req.DeviceName = "primary"
	}
	if _, err := auth.ParsePublicKey(req.DevicePublicKey); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_device_key", "device_public_key must be ed25519 base64")
		return
	}
	if req.KDFParamsJSON == "" || req.WrappedDEKPIN == "" || req.WrappedDEKRecovery == "" {
		httpx.Error(w, http.StatusBadRequest, "missing_vault_meta", "kdf_params_json, wrapped_dek_pin, wrapped_dek_recovery required")
		return
	}
	// Server never sees PIN/recovery plaintext — only opaque ciphertext blobs (REQ-015/016).
	if len(req.WrappedDEKPIN) < 16 || len(req.WrappedDEKRecovery) < 16 {
		httpx.Error(w, http.StatusBadRequest, "invalid_wrapped_dek", "wrapped DEK blobs too short")
		return
	}

	taken, err := a.Store.UsernameTaken(r.Context(), username)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "lookup failed")
		return
	}
	if taken {
		httpx.Error(w, http.StatusConflict, "username_taken", "username already registered")
		return
	}

	ts := time.Now().UTC().Format(time.RFC3339Nano)
	userID := auth.NewID()
	deviceID := auth.NewID()
	token, tokenHash, err := auth.NewToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "token failed")
		return
	}
	sessID := auth.NewID()

	err = a.Store.CreateUserWithVault(r.Context(),
		store.User{ID: userID, Username: username, UsernameNormalized: username, DisplayName: req.DisplayName, CreatedAt: ts},
		store.Device{ID: deviceID, UserID: userID, Name: req.DeviceName, PublicKey: req.DevicePublicKey, CreatedAt: ts},
		store.VaultMeta{
			UserID: userID, KDFParamsJSON: req.KDFParamsJSON,
			WrappedDEKPIN: req.WrappedDEKPIN, WrappedDEKRecovery: req.WrappedDEKRecovery,
			Version: 1, UpdatedAt: ts,
		},
		store.Session{
			ID: sessID, UserID: userID, DeviceID: deviceID, TokenHash: tokenHash,
			ExpiresAt: auth.SessionExpiry(30 * 24 * time.Hour), CreatedAt: ts,
		},
	)
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			httpx.Error(w, http.StatusConflict, "username_taken", "username already registered")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "internal", "register failed")
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"user_id":          userID,
		"username":         username,
		"device_id":        deviceID,
		"session_token":    token,
		"expires_in_hours": 30 * 24,
		"enrollment_note":  "Client must complete username → PIN → recovery before calling register (ADR-012). Server stores ciphertext only.",
	})
}

type challengeReq struct {
	Username string `json:"username"`
	DeviceID string `json:"device_id"`
}

func (a *API) challenge(w http.ResponseWriter, r *http.Request) {
	var req challengeReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	username := strings.ToLower(strings.TrimSpace(req.Username))
	u, err := a.Store.GetUserByUsername(r.Context(), username)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "invalid credentials")
		return
	}
	d, err := a.Store.GetDevice(r.Context(), req.DeviceID)
	if err != nil || d.UserID != u.ID || d.Revoked {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "invalid credentials")
		return
	}
	nonce, err := auth.NewNonce()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "nonce failed")
		return
	}
	chID := auth.NewID()
	exp := time.Now().UTC().Add(5 * time.Minute).Format(time.RFC3339Nano)
	if err := a.Store.CreateChallenge(r.Context(), chID, d.ID, nonce, exp); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "challenge failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{
		"challenge_id": chID,
		"nonce":        nonce,
		"expires_at":   exp,
	})
}

type sessionReq struct {
	ChallengeID string `json:"challenge_id"`
	Signature   string `json:"signature"`
}

func (a *API) createSession(w http.ResponseWriter, r *http.Request) {
	var req sessionReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	deviceID, nonce, exp, err := a.Store.TakeChallenge(r.Context(), req.ChallengeID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "invalid challenge")
		return
	}
	if auth.IsExpired(exp) {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "challenge expired")
		return
	}
	d, err := a.Store.GetDevice(r.Context(), deviceID)
	if err != nil || d.Revoked {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "invalid device")
		return
	}
	pub, err := auth.ParsePublicKey(d.PublicKey)
	if err != nil || !auth.VerifySignature(pub, nonce, req.Signature) {
		httpx.Error(w, http.StatusUnauthorized, "auth_failed", "bad signature")
		return
	}
	token, hash, err := auth.NewToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "token failed")
		return
	}
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	sess := store.Session{
		ID: auth.NewID(), UserID: d.UserID, DeviceID: d.ID, TokenHash: hash,
		ExpiresAt: auth.SessionExpiry(30 * 24 * time.Hour), CreatedAt: ts,
	}
	if err := a.Store.CreateSession(r.Context(), sess); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "session failed")
		return
	}
	_ = a.Store.TouchDevice(r.Context(), d.ID)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"session_token": token,
		"user_id":       d.UserID,
		"device_id":     d.ID,
		"expires_at":    sess.ExpiresAt,
	})
}

func (a *API) auth(next func(http.ResponseWriter, *http.Request, SessionPrincipal)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		sess, err := a.Store.SessionByTokenHash(r.Context(), auth.HashToken(token))
		if err != nil || auth.IsExpired(sess.ExpiresAt) {
			httpx.Error(w, http.StatusUnauthorized, "unauthorized", "invalid session")
			return
		}
		next(w, r, SessionPrincipal{UserID: sess.UserID, DeviceID: sess.DeviceID})
	}
}

func (a *API) listDevices(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	devs, err := a.Store.ListDevices(r.Context(), p.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "list failed")
		return
	}
	out := make([]map[string]any, 0, len(devs))
	for _, d := range devs {
		out = append(out, map[string]any{
			"id": d.ID, "name": d.Name, "created_at": d.CreatedAt,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"devices": out})
}

type pairReq struct {
	Name      string `json:"name"`
	PublicKey string `json:"public_key"`
}

func (a *API) pairDevice(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	var req pairReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httpx.Error(w, http.StatusBadRequest, "invalid_name", "device name required")
		return
	}
	if _, err := auth.ParsePublicKey(req.PublicKey); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_device_key", "public_key must be ed25519 base64")
		return
	}
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	id := auth.NewID()
	if err := a.Store.AddDevice(r.Context(), store.Device{
		ID: id, UserID: p.UserID, Name: req.Name, PublicKey: req.PublicKey, CreatedAt: ts,
	}); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "pair failed")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"device_id": id, "name": req.Name})
}

func (a *API) getVaultMeta(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	vm, err := a.Store.GetVaultMeta(r.Context(), p.UserID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "vault meta missing")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"kdf_params_json":      vm.KDFParamsJSON,
		"wrapped_dek_pin":      vm.WrappedDEKPIN,
		"wrapped_dek_recovery": vm.WrappedDEKRecovery,
		"version":              vm.Version,
		"updated_at":           vm.UpdatedAt,
	})
}

type vaultMetaReq struct {
	KDFParamsJSON      string `json:"kdf_params_json"`
	WrappedDEKPIN      string `json:"wrapped_dek_pin"`
	WrappedDEKRecovery string `json:"wrapped_dek_recovery"`
	Version            int    `json:"version"`
}

func (a *API) putVaultMeta(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	var req vaultMetaReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	if req.KDFParamsJSON == "" || req.WrappedDEKPIN == "" || req.WrappedDEKRecovery == "" {
		httpx.Error(w, http.StatusBadRequest, "missing_fields", "vault meta fields required")
		return
	}
	if req.Version < 1 {
		req.Version = 1
	}
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	if err := a.Store.UpsertVaultMeta(r.Context(), store.VaultMeta{
		UserID: p.UserID, KDFParamsJSON: req.KDFParamsJSON,
		WrappedDEKPIN: req.WrappedDEKPIN, WrappedDEKRecovery: req.WrappedDEKRecovery,
		Version: req.Version, UpdatedAt: ts,
	}); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "update failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok", "updated_at": ts})
}

type itemReq struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
	AAD        string `json:"aad"`
}

func (a *API) createItem(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	var req itemReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	if req.Ciphertext == "" || req.Nonce == "" {
		httpx.Error(w, http.StatusBadRequest, "missing_fields", "ciphertext and nonce required")
		return
	}
	id := auth.NewID()
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	if err := a.Store.CreateItem(r.Context(), store.Item{
		ID: id, UserID: p.UserID, Ciphertext: req.Ciphertext, Nonce: req.Nonce, AAD: req.AAD, UpdatedAt: ts,
	}); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "create failed")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id, "updated_at": ts})
}

func (a *API) listItems(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	items, err := a.Store.ListItems(r.Context(), p.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal", "list failed")
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"id": it.ID, "ciphertext": it.Ciphertext, "nonce": it.Nonce, "aad": it.AAD, "updated_at": it.UpdatedAt,
		})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"items": out})
}

func (a *API) getItem(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	id := r.PathValue("id")
	it, err := a.Store.GetItem(r.Context(), p.UserID, id)
	if err != nil || it.DeletedAt != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "item not found")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"id": it.ID, "ciphertext": it.Ciphertext, "nonce": it.Nonce, "aad": it.AAD, "updated_at": it.UpdatedAt,
	})
}

func (a *API) updateItem(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	id := r.PathValue("id")
	var req itemReq
	if err := decodeJSON(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "could not parse body")
		return
	}
	if req.Ciphertext == "" || req.Nonce == "" {
		httpx.Error(w, http.StatusBadRequest, "missing_fields", "ciphertext and nonce required")
		return
	}
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	if err := a.Store.UpdateItem(r.Context(), p.UserID, id, req.Ciphertext, req.Nonce, req.AAD, ts); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "item not found")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"id": id, "updated_at": ts})
}

func (a *API) deleteItem(w http.ResponseWriter, r *http.Request, p SessionPrincipal) {
	id := r.PathValue("id")
	if err := a.Store.SoftDeleteItem(r.Context(), p.UserID, id); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "item not found")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": id})
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}
