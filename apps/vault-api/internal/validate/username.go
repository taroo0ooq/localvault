package validate

import "regexp"

var usernameRe = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

// Username returns true for simple local usernames (REQ-020 / ADR-012).
func Username(u string) bool {
	return usernameRe.MatchString(u)
}
