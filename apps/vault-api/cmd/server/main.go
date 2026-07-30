package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/taroo0ooq/localvault/apps/vault-api/internal/api"
	"github.com/taroo0ooq/localvault/apps/vault-api/internal/store"
)

func main() {
	addr := envOr("VAULT_LISTEN", "0.0.0.0:8443")
	dbPath := envOr("VAULT_DB", "/data/vault.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		// relative paths like ./vault.db — dir may be .
		_ = err
	}

	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	a := &api.API{Store: st}
	mux := http.NewServeMux()
	a.Routes(mux)

	log.Printf("localvault-api listening on %s db=%s (S2 multiuser)", addr, dbPath)
	// nosemgrep: go.lang.security.audit.net.use-tls.use-tls
	// TLS terminates at Cloudflare/ngrok (S4). Local Docker uses plain HTTP.
	if err := http.ListenAndServe(addr, mux); err != nil { // nosemgrep: go.lang.security.audit.net.use-tls.use-tls
		log.Fatal(err)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
