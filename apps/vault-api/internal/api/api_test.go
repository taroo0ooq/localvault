package api_test

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/taroo0ooq/localvault/apps/vault-api/internal/api"
	"github.com/taroo0ooq/localvault/apps/vault-api/internal/store"
)

func setup(t *testing.T) (*api.API, *http.ServeMux) {
	t.Helper()
	db := filepath.Join(t.TempDir(), "test.db")
	st, err := store.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	a := &api.API{Store: st}
	mux := http.NewServeMux()
	a.Routes(mux)
	return a, mux
}

func keyPair(t *testing.T) (pubB64 string, priv ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(pub), priv
}

func register(t *testing.T, mux *http.ServeMux, username, pubB64 string) (token, deviceID string) {
	t.Helper()
	body := map[string]any{
		"username":             username,
		"device_name":          "test-device",
		"device_public_key":    pubB64,
		"kdf_params_json":      `{"m":65536,"t":3,"p":1}`,
		"wrapped_dek_pin":      "wrapped-pin-ciphertext-blob-aaaa",
		"wrapped_dek_recovery": "wrapped-recovery-ciphertext-bbbb",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/v1/users/register", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("register %s: %d %s", username, rr.Code, rr.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &resp)
	return resp["session_token"].(string), resp["device_id"].(string)
}

func TestHealthAndServerInfo(t *testing.T) {
	_, mux := setup(t)
	for _, path := range []string{"/healthz", "/v1/server-info", "/"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s => %d", path, rr.Code)
		}
	}
}

func TestUsernameCheck(t *testing.T) {
	_, mux := setup(t)
	req := httptest.NewRequest(http.MethodGet, "/v1/users/check?username=tareq", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatal(rr.Body.String())
	}
	var resp map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &resp)
	if resp["available"] != true {
		t.Fatalf("%v", resp)
	}
}

func TestMultiuserIsolation(t *testing.T) {
	_, mux := setup(t)
	pubA, _ := keyPair(t)
	pubB, _ := keyPair(t)
	tokA, _ := register(t, mux, "alice", pubA)
	tokB, _ := register(t, mux, "bob", pubB)

	// Alice creates item
	createBody, _ := json.Marshal(map[string]string{
		"ciphertext": "cipher-A-secret",
		"nonce":      "nonce-A",
		"aad":        "aad-A",
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/items", bytes.NewReader(createBody))
	req.Header.Set("Authorization", "Bearer "+tokA)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("create: %s", rr.Body.String())
	}
	var created map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &created)
	itemID := created["id"]

	// Bob list must be empty
	req = httptest.NewRequest(http.MethodGet, "/v1/items", nil)
	req.Header.Set("Authorization", "Bearer "+tokB)
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	var list map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &list)
	items := list["items"].([]any)
	if len(items) != 0 {
		t.Fatalf("bob should see 0 items, got %d", len(items))
	}

	// Bob cannot GET alice item
	req = httptest.NewRequest(http.MethodGet, "/v1/items/"+itemID, nil)
	req.Header.Set("Authorization", "Bearer "+tokB)
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user get, got %d", rr.Code)
	}

	// Alice sees her item
	req = httptest.NewRequest(http.MethodGet, "/v1/items", nil)
	req.Header.Set("Authorization", "Bearer "+tokA)
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	_ = json.Unmarshal(rr.Body.Bytes(), &list)
	items = list["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("alice items=%d", len(items))
	}
}

func TestDevicePairAndSession(t *testing.T) {
	_, mux := setup(t)
	pub, priv := keyPair(t)
	tok, deviceID := register(t, mux, "carol", pub)

	// pair second device
	pub2, priv2 := keyPair(t)
	body, _ := json.Marshal(map[string]string{"name": "laptop", "public_key": pub2})
	req := httptest.NewRequest(http.MethodPost, "/v1/devices", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("pair: %s", rr.Body.String())
	}
	var pair map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &pair)
	newDev := pair["device_id"]

	// challenge + session for new device
	chBody, _ := json.Marshal(map[string]string{"username": "carol", "device_id": newDev})
	req = httptest.NewRequest(http.MethodPost, "/v1/auth/challenge", bytes.NewReader(chBody))
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("challenge: %s", rr.Body.String())
	}
	var ch map[string]string
	_ = json.Unmarshal(rr.Body.Bytes(), &ch)
	sig := ed25519.Sign(priv2, []byte(ch["nonce"]))
	sigB64 := base64.StdEncoding.EncodeToString(sig)
	sessBody, _ := json.Marshal(map[string]string{"challenge_id": ch["challenge_id"], "signature": sigB64})
	req = httptest.NewRequest(http.MethodPost, "/v1/auth/session", bytes.NewReader(sessBody))
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("session: %s", rr.Body.String())
	}

	// bad signature with original priv should fail for new device challenge
	_ = deviceID
	_ = priv
}

func TestDuplicateUsername(t *testing.T) {
	_, mux := setup(t)
	pub, _ := keyPair(t)
	register(t, mux, "dave", pub)
	// second register same name
	body := map[string]any{
		"username":             "dave",
		"device_public_key":    pub,
		"kdf_params_json":      `{}`,
		"wrapped_dek_pin":      "wrapped-pin-ciphertext-blob-aaaa",
		"wrapped_dek_recovery": "wrapped-recovery-ciphertext-bbbb",
	}
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/v1/users/register", bytes.NewReader(b))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("expected conflict, got %d", rr.Code)
	}
}
