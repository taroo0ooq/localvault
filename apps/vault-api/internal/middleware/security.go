package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SecurityHeaders applies defense-in-depth headers on every response (S8).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cache-Control", "no-store")
		if r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// BodyLimit rejects oversized request bodies (default 1 MiB).
func BodyLimit(maxBytes int64, next http.Handler) http.Handler {
	if maxBytes <= 0 {
		maxBytes = 1 << 20
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		}
		next.ServeHTTP(w, r)
	})
}

// IPRateLimiter is a simple fixed-window counter (no external deps — keep light).
type IPRateLimiter struct {
	mu       sync.Mutex
	window   time.Duration
	limit    int
	hits     map[string]int
	resetAt  map[string]time.Time
}

func NewIPRateLimiter(limit int, window time.Duration) *IPRateLimiter {
	if limit <= 0 {
		limit = 120
	}
	if window <= 0 {
		window = time.Minute
	}
	return &IPRateLimiter{
		window:  window,
		limit:   limit,
		hits:    make(map[string]int),
		resetAt: make(map[string]time.Time),
	}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (l *IPRateLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if t, ok := l.resetAt[ip]; !ok || now.After(t) {
		l.resetAt[ip] = now.Add(l.window)
		l.hits[ip] = 1
		return true
	}
	l.hits[ip]++
	return l.hits[ip] <= l.limit
}

func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		if !l.Allow(ip) {
			w.Header().Set("Retry-After", "60")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate_limited","message":"too many requests"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
