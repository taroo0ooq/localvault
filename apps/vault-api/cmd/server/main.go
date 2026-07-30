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
	if dir := filepath.Dir(dbPath); dir != "." && dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}

	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	a := &api.API{Store: st}
	mux := http.NewServeMux()
	a.Routes(mux)

	log.Printf("localvault-api listening on %s db=%s (S3 client-ready)", addr, dbPath)
	// nosemgrep: go.lang.security.audit.net.use-tls.use-tls
	// TLS terminates at Cloudflare/ngrok (S4). Local Docker uses plain HTTP.
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil { // nosemgrep: go.lang.security.audit.net.use-tls.use-tls
		log.Fatal(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
