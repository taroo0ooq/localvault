package validate

import "testing"

func TestUsername(t *testing.T) {
	ok := []string{"tareq", "alex.home", "kids_tablet", "a12"}
	for _, u := range ok {
		if !Username(u) {
			t.Fatalf("expected valid: %s", u)
		}
	}
	bad := []string{"", "ab", "Bad", "has space", "x", "UPPER", "a@b"}
	for _, u := range bad {
		if Username(u) {
			t.Fatalf("expected invalid: %s", u)
		}
	}
}
