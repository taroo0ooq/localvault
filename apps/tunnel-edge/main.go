// Command tunnel-edge is a minimal reverse proxy used in CI to simulate a
// Cloudflare/ngrok edge hopping to vault-api (S4 remote_pair_test).
// Not for production — production uses cloudflared/ngrok images.
package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
)

func main() {
	listen := envOr("EDGE_LISTEN", "0.0.0.0:9443")
	upstream := envOr("EDGE_UPSTREAM", "http://127.0.0.1:8443")
	u, err := url.Parse(upstream)
	if err != nil {
		log.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(u)
	// Preserve Host for app logs; mark hop for debugging
	orig := proxy.Director
	proxy.Director = func(r *http.Request) {
		orig(r)
		r.Header.Set("X-LocalVault-Edge", "tunnel-sim")
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		// proxy health through
		proxy.ServeHTTP(w, r)
	})
	mux.Handle("/", proxy)
	log.Printf("tunnel-edge listening %s → %s", listen, upstream)
	// nosemgrep: go.lang.security.audit.net.use-tls.use-tls
	log.Fatal(http.ListenAndServe(listen, mux)) // nosemgrep: go.lang.security.audit.net.use-tls.use-tls
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
