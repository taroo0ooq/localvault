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
	w.Header().Set("Content-Type", "application/json")
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
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"name":    "LocalVault",
		"version": "0.1.0-s1",
		"stage":   "S1",
		// Multiuser + crypto come in S2/S3 — scaffold only
		"features": map[string]bool{
			"multiuser": false,
			"crypto":    false,
		},
	})
}
