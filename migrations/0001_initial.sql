-- Migration: 0001_initial
-- Description: Full initial schema for disposable email gateway

-- User preferences (created on first login)
CREATE TABLE user_settings (
  user              TEXT PRIMARY KEY,
  catch_all         INTEGER NOT NULL DEFAULT 1,
  from_name_format  TEXT    NOT NULL DEFAULT 'sender_count_alias',
  default_limit     INTEGER NOT NULL DEFAULT 24,
  bandwidth_limit   INTEGER NOT NULL DEFAULT 104857600,
  bandwidth_used    INTEGER NOT NULL DEFAULT 0,
  bandwidth_reset_at TEXT   NOT NULL DEFAULT (datetime('now'))
);

-- Verified forwarding destinations
CREATE TABLE recipients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  verified_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user, email)
);

CREATE INDEX idx_recipients_user ON recipients(user);

-- Disposable aliases
CREATE TABLE aliases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user        TEXT    NOT NULL,
  tag         TEXT    NOT NULL,
  description TEXT,
  "limit"     INTEGER NOT NULL DEFAULT 24,
  forwarded   INTEGER NOT NULL DEFAULT 0,
  rejected    INTEGER NOT NULL DEFAULT 0,
  bytes_forwarded INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_forwarded_at TEXT,
  last_rejected_at  TEXT,
  UNIQUE(user, tag)
);

CREATE INDEX idx_aliases_user ON aliases(user);

-- Many-to-many: alias -> recipients
CREATE TABLE alias_recipients (
  alias_id     INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  PRIMARY KEY (alias_id, recipient_id)
);

-- Per-alias sender whitelist
CREATE TABLE whitelist_entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  alias_id INTEGER NOT NULL REFERENCES aliases(id) ON DELETE CASCADE,
  type     TEXT    NOT NULL CHECK(type IN ('email', 'domain', 'segment')),
  pattern  TEXT    NOT NULL,
  UNIQUE(alias_id, type, pattern)
);

CREATE INDEX idx_whitelist_alias ON whitelist_entries(alias_id);

-- User-level filtering rules (evaluated in priority order)
CREATE TABLE rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  priority   INTEGER NOT NULL DEFAULT 0,
  operator   TEXT    NOT NULL DEFAULT 'and' CHECK(operator IN ('and', 'or')),
  action     TEXT    NOT NULL DEFAULT 'block'
             CHECK(action IN ('forward', 'block', 'reject')),
  forward_to TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  hit_count  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  last_hit_at TEXT
);

CREATE INDEX idx_rules_user_priority ON rules(user, priority);

-- Conditions attached to rules
CREATE TABLE rule_conditions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id  INTEGER NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field    TEXT    NOT NULL CHECK(field IN ('sender', 'sender_domain',
           'subject', 'alias_tag')),
  match    TEXT    NOT NULL CHECK(match IN ('equals', 'contains',
           'starts_with', 'ends_with', 'regex')),
  value    TEXT    NOT NULL
);

CREATE INDEX idx_rule_conditions_rule ON rule_conditions(rule_id);

-- Failed delivery log
CREATE TABLE failed_deliveries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user       TEXT    NOT NULL,
  alias_tag  TEXT,
  sender     TEXT,
  subject    TEXT,
  reason     TEXT    NOT NULL,
  message_size INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_failed_user ON failed_deliveries(user, created_at);
