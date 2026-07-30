package main

import (
	"log"
	"net/http"
	"os"

	"github.com/taroo0ooq/localvault/apps/vault-api/internal/health"
)

func main() {
	addr := envOr("VAULT_LISTEN", "0.0.0.0:8443")
	mux := http.NewServeMux()
	mux.HandleFunc("/", health.RootHandler)
	mux.HandleFunc("/healthz", health.Handler)
	mux.HandleFunc("/v1/server-info", health.ServerInfoHandler)

	log.Printf("localvault-api listening on %s (S1 scaffold)", addr)
	// nosemgrep: go.lang.security.audit.net.use-tls.use-tls
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
