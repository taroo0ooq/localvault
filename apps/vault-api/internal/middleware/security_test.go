package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSecurityHeaders(t *testing.T) {
	h := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/", nil))
	if rr.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("missing nosniff")
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
	if rr.Header().Get("Cross-Origin-Resource-Policy") != "same-origin" {
		t.Fatal("missing CORP")
	}
}

func TestRateLimiter(t *testing.T) {
	l := NewIPRateLimiter(3, time.Minute)
	if !l.Allow("1.1.1.1") || !l.Allow("1.1.1.1") || !l.Allow("1.1.1.1") {
		t.Fatal("first 3 should pass")
	}
	if l.Allow("1.1.1.1") {
		t.Fatal("4th should fail")
	}
	if !l.Allow("2.2.2.2") {
		t.Fatal("other IP ok")
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	l := NewIPRateLimiter(1, time.Minute)
	h := l.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "9.9.9.9:1234"
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("want 200 got %d", rr.Code)
	}
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req)
	if rr2.Code != http.StatusTooManyRequests {
		t.Fatalf("want 429 got %d", rr2.Code)
	}
}
