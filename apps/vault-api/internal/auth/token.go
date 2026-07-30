package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"
)

func NewID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func NewToken() (plain string, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	plain = base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(plain))
	hash = hex.EncodeToString(sum[:])
	return plain, hash, nil
}

func HashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}

func NewNonce() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// ParsePublicKey expects base64-encoded ed25519 public key (32 bytes).
func ParsePublicKey(b64 string) (ed25519.PublicKey, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		// try raw url
		raw, err = base64.RawURLEncoding.DecodeString(b64)
		if err != nil {
			return nil, fmt.Errorf("invalid public key encoding")
		}
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("invalid public key length")
	}
	return ed25519.PublicKey(raw), nil
}

// VerifySignature checks ed25519 signature over message (nonce bytes as UTF-8 string).
func VerifySignature(pub ed25519.PublicKey, message, sigB64 string) bool {
	sig, err := base64.StdEncoding.DecodeString(sigB64)
	if err != nil {
		sig, err = base64.RawURLEncoding.DecodeString(sigB64)
		if err != nil {
			return false
		}
	}
	return ed25519.Verify(pub, []byte(message), sig)
}

func SessionExpiry(d time.Duration) string {
	return time.Now().UTC().Add(d).Format(time.RFC3339Nano)
}

func IsExpired(rfc3339 string) bool {
	t, err := time.Parse(time.RFC3339Nano, rfc3339)
	if err != nil {
		t, err = time.Parse(time.RFC3339, rfc3339)
		if err != nil {
			return true
		}
	}
	return time.Now().UTC().After(t)
}
