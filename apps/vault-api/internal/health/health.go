package health

import (
	"encoding/json"
	"net/http"
)

// Handler returns liveness without leaking secrets (REQ-001).
func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	setAPIHeaders(w)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"service": "localvault-api",
		"stage":   "S1",
	})
}

// ServerInfoHandler returns non-secret server metadata.
func ServerInfoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	setAPIHeaders(w)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"name":    "LocalVault",
		"version": "0.1.0-s1",
		"stage":   "S1",
		"features": map[string]bool{
			"multiuser": false,
			"crypto":    false,
		},
	})
}

// RootHandler serves GET / so DAST spiders receive 200 (issue #6).
func RootHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	setAPIHeaders(w)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"service": "localvault-api",
		"docs":    "/v1/server-info",
		"health":  "/healthz",
	})
}

func setAPIHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}
