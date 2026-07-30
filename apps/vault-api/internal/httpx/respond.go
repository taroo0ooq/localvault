package httpx

import (
	"encoding/json"
	"net/http"
)

func SetAPIHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
}

func JSON(w http.ResponseWriter, status int, v any) {
	SetAPIHeaders(w)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func Error(w http.ResponseWriter, status int, code, msg string) {
	JSON(w, status, map[string]string{"error": code, "message": msg})
}
