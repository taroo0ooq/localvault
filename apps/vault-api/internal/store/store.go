package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("conflict")
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vault_meta (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  kdf_params_json TEXT NOT NULL,
  wrapped_dek_pin TEXT NOT NULL,
  wrapped_dek_recovery TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items_ciphertext (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  aad TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_user ON items_ciphertext(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`)
	return err
}

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

type User struct {
	ID                 string
	Username           string
	UsernameNormalized string
	DisplayName        string
	CreatedAt          string
}

type Device struct {
	ID        string
	UserID    string
	Name      string
	PublicKey string
	CreatedAt string
	Revoked   bool
}

type Session struct {
	ID        string
	UserID    string
	DeviceID  string
	TokenHash string
	ExpiresAt string
	CreatedAt string
}

type VaultMeta struct {
	UserID             string
	KDFParamsJSON      string
	WrappedDEKPIN      string
	WrappedDEKRecovery string
	Version            int
	UpdatedAt          string
}

type Item struct {
	ID         string
	UserID     string
	Ciphertext string
	Nonce      string
	AAD        string
	UpdatedAt  string
	DeletedAt  *string
}

func (s *Store) UsernameTaken(ctx context.Context, normalized string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(1) FROM users WHERE username_normalized = ? AND revoked_at IS NULL`, normalized).Scan(&n)
	return n > 0, err
}

func (s *Store) CreateUserWithVault(ctx context.Context, u User, d Device, vm VaultMeta, sess Session) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx, `INSERT INTO users (id, username, username_normalized, display_name, created_at) VALUES (?,?,?,?,?)`,
		u.ID, u.Username, u.UsernameNormalized, u.DisplayName, u.CreatedAt)
	if err != nil {
		return fmt.Errorf("%w: user", ErrConflict)
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO devices (id, user_id, name, public_key, created_at, last_seen, revoked) VALUES (?,?,?,?,?,?,0)`,
		d.ID, d.UserID, d.Name, d.PublicKey, d.CreatedAt, d.CreatedAt)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO vault_meta (user_id, kdf_params_json, wrapped_dek_pin, wrapped_dek_recovery, version, updated_at) VALUES (?,?,?,?,?,?)`,
		vm.UserID, vm.KDFParamsJSON, vm.WrappedDEKPIN, vm.WrappedDEKRecovery, vm.Version, vm.UpdatedAt)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO sessions (id, user_id, device_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)`,
		sess.ID, sess.UserID, sess.DeviceID, sess.TokenHash, sess.ExpiresAt, sess.CreatedAt)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetUserByUsername(ctx context.Context, normalized string) (*User, error) {
	u := &User{}
	err := s.db.QueryRowContext(ctx, `SELECT id, username, username_normalized, COALESCE(display_name,''), created_at FROM users WHERE username_normalized = ? AND revoked_at IS NULL`, normalized).
		Scan(&u.ID, &u.Username, &u.UsernameNormalized, &u.DisplayName, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return u, err
}

func (s *Store) GetDevice(ctx context.Context, deviceID string) (*Device, error) {
	d := &Device{}
	var revoked int
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, name, public_key, created_at, revoked FROM devices WHERE id = ?`, deviceID).
		Scan(&d.ID, &d.UserID, &d.Name, &d.PublicKey, &d.CreatedAt, &revoked)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	d.Revoked = revoked != 0
	return d, err
}

func (s *Store) ListDevices(ctx context.Context, userID string) ([]Device, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, name, public_key, created_at, revoked FROM devices WHERE user_id = ? AND revoked = 0`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Device
	for rows.Next() {
		var d Device
		var revoked int
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.PublicKey, &d.CreatedAt, &revoked); err != nil {
			return nil, err
		}
		d.Revoked = revoked != 0
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) AddDevice(ctx context.Context, d Device) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO devices (id, user_id, name, public_key, created_at, last_seen, revoked) VALUES (?,?,?,?,?,?,0)`,
		d.ID, d.UserID, d.Name, d.PublicKey, d.CreatedAt, d.CreatedAt)
	return err
}

func (s *Store) CreateChallenge(ctx context.Context, id, deviceID, nonce, expiresAt string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO auth_challenges (id, device_id, nonce, expires_at) VALUES (?,?,?,?)`, id, deviceID, nonce, expiresAt)
	return err
}

func (s *Store) TakeChallenge(ctx context.Context, id string) (deviceID, nonce, expiresAt string, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", "", "", err
	}
	defer func() { _ = tx.Rollback() }()
	err = tx.QueryRowContext(ctx, `SELECT device_id, nonce, expires_at FROM auth_challenges WHERE id = ?`, id).Scan(&deviceID, &nonce, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", "", ErrNotFound
	}
	if err != nil {
		return "", "", "", err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM auth_challenges WHERE id = ?`, id)
	if err != nil {
		return "", "", "", err
	}
	return deviceID, nonce, expiresAt, tx.Commit()
}

func (s *Store) CreateSession(ctx context.Context, sess Session) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (id, user_id, device_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?,?)`,
		sess.ID, sess.UserID, sess.DeviceID, sess.TokenHash, sess.ExpiresAt, sess.CreatedAt)
	return err
}

func (s *Store) SessionByTokenHash(ctx context.Context, hash string) (*Session, error) {
	sess := &Session{}
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, device_id, token_hash, expires_at, created_at FROM sessions WHERE token_hash = ?`, hash).
		Scan(&sess.ID, &sess.UserID, &sess.DeviceID, &sess.TokenHash, &sess.ExpiresAt, &sess.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return sess, err
}

func (s *Store) TouchDevice(ctx context.Context, deviceID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE devices SET last_seen = ? WHERE id = ?`, now(), deviceID)
	return err
}

func (s *Store) GetVaultMeta(ctx context.Context, userID string) (*VaultMeta, error) {
	vm := &VaultMeta{}
	err := s.db.QueryRowContext(ctx, `SELECT user_id, kdf_params_json, wrapped_dek_pin, wrapped_dek_recovery, version, updated_at FROM vault_meta WHERE user_id = ?`, userID).
		Scan(&vm.UserID, &vm.KDFParamsJSON, &vm.WrappedDEKPIN, &vm.WrappedDEKRecovery, &vm.Version, &vm.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return vm, err
}

func (s *Store) UpsertVaultMeta(ctx context.Context, vm VaultMeta) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO vault_meta (user_id, kdf_params_json, wrapped_dek_pin, wrapped_dek_recovery, version, updated_at)
VALUES (?,?,?,?,?,?)
ON CONFLICT(user_id) DO UPDATE SET
  kdf_params_json=excluded.kdf_params_json,
  wrapped_dek_pin=excluded.wrapped_dek_pin,
  wrapped_dek_recovery=excluded.wrapped_dek_recovery,
  version=excluded.version,
  updated_at=excluded.updated_at
`, vm.UserID, vm.KDFParamsJSON, vm.WrappedDEKPIN, vm.WrappedDEKRecovery, vm.Version, vm.UpdatedAt)
	return err
}

func (s *Store) CreateItem(ctx context.Context, it Item) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO items_ciphertext (id, user_id, ciphertext, nonce, aad, updated_at) VALUES (?,?,?,?,?,?)`,
		it.ID, it.UserID, it.Ciphertext, it.Nonce, it.AAD, it.UpdatedAt)
	return err
}

func (s *Store) GetItem(ctx context.Context, userID, id string) (*Item, error) {
	it := &Item{}
	var deleted sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, ciphertext, nonce, aad, updated_at, deleted_at FROM items_ciphertext WHERE id = ? AND user_id = ?`, id, userID).
		Scan(&it.ID, &it.UserID, &it.Ciphertext, &it.Nonce, &it.AAD, &it.UpdatedAt, &deleted)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if deleted.Valid {
		it.DeletedAt = &deleted.String
	}
	return it, err
}

func (s *Store) ListItems(ctx context.Context, userID string) ([]Item, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, ciphertext, nonce, aad, updated_at FROM items_ciphertext WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.UserID, &it.Ciphertext, &it.Nonce, &it.AAD, &it.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *Store) UpdateItem(ctx context.Context, userID, id, ciphertext, nonce, aad, updatedAt string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE items_ciphertext SET ciphertext=?, nonce=?, aad=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`,
		ciphertext, nonce, aad, updatedAt, id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) SoftDeleteItem(ctx context.Context, userID, id string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE items_ciphertext SET deleted_at=?, updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`,
		now(), now(), id, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
