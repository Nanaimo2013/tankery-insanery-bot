-- Tankery Insanery - MTC Match Manager
-- Copyright © Nan's Studio's
-- All rights reserved.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tanks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  display_name    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_id         TEXT NOT NULL,
  nation          TEXT,
  era             TEXT NOT NULL CHECK (era IN ('WWI','WWII','COLD_WAR','MODERN')),
  vehicle_type    TEXT,
  tier            INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 0),
  year_introduced INTEGER,
  is_ww1          INTEGER NOT NULL DEFAULT 0,
  is_ww2          INTEGER NOT NULL DEFAULT 0,
  is_cold_war     INTEGER NOT NULL DEFAULT 0,
  is_modern       INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1,
  needs_review    INTEGER NOT NULL DEFAULT 0,
  aliases         TEXT NOT NULL DEFAULT '[]',
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tanks_name_id ON tanks(name_id);
CREATE INDEX IF NOT EXISTS idx_tanks_era ON tanks(era);

CREATE TABLE IF NOT EXISTS equipment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  name_id      TEXT NOT NULL,
  class_name   TEXT NOT NULL CHECK (class_name IN ('Infantry','Crewman','Engineer')),
  slot         TEXT NOT NULL CHECK (slot IN ('Primary','Secondary','Tertiary','PassiveTools')),
  tier         INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 0),
  enabled      INTEGER NOT NULL DEFAULT 1,
  needs_review INTEGER NOT NULL DEFAULT 0,
  aliases      TEXT NOT NULL DEFAULT '[]',
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name_id, class_name, slot)
);

CREATE TABLE IF NOT EXISTS schools (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  short_name           TEXT,
  country              TEXT,
  description          TEXT,
  discord_role_id      TEXT,
  enabled              INTEGER NOT NULL DEFAULT 1,
  decals               TEXT NOT NULL DEFAULT '[]',
  special_requirements TEXT NOT NULL DEFAULT '[]',
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS school_tanks (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id               INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  tank_id                 INTEGER NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  quantity                INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  quantity_needs_review   INTEGER NOT NULL DEFAULT 0,
  special_requirements    TEXT,
  notes                   TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (school_id, tank_id)
);

CREATE TABLE IF NOT EXISTS school_equipment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id    INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  UNIQUE (school_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS school_camos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  camo_name TEXT NOT NULL COLLATE NOCASE,
  UNIQUE (school_id, camo_name)
);

CREATE TABLE IF NOT EXISTS matches (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','READY','ACTIVE','COMPLETED','CANCELLED')),
  referee_id           TEXT NOT NULL,
  hawk_count           INTEGER NOT NULL CHECK (hawk_count >= 1),
  eagle_count          INTEGER NOT NULL CHECK (eagle_count >= 1),
  tier_cap             INTEGER CHECK (tier_cap IS NULL OR tier_cap >= 1),   -- NULL = no tier limit
  full_loadout         INTEGER NOT NULL DEFAULT 0,                          -- 1 = every school brings its whole (tier-limited) loadout
  scheduled_at         INTEGER,                                             -- unix seconds (UTC); Discord renders it per viewer
  timezone             TEXT,                                                -- zone the referee typed the time in (informational)
  hawk_wins            INTEGER NOT NULL DEFAULT 0 CHECK (hawk_wins >= 0),
  eagle_wins           INTEGER NOT NULL DEFAULT 0 CHECK (eagle_wins >= 0),
  winner               TEXT CHECK (winner IS NULL OR winner IN ('H','E','DRAW')),
  announce_channel_id  TEXT,
  announce_message_id  TEXT,
  loadout_channel_id   TEXT,
  loadout_message_id   TEXT,
  loadout_json         TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at         TEXT,
  started_at           TEXT,
  completed_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_referee ON matches(referee_id);

CREATE TABLE IF NOT EXISTS match_teams (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  side      TEXT NOT NULL CHECK (side IN ('H','E')),
  slot      INTEGER NOT NULL,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  UNIQUE (match_id, side, slot)
);

CREATE TABLE IF NOT EXISTS match_vehicles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id   INTEGER NOT NULL REFERENCES match_teams(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  tank_id   INTEGER NOT NULL REFERENCES tanks(id) ON DELETE RESTRICT,
  name_id   TEXT NOT NULL,
  tier      INTEGER NOT NULL DEFAULT 1,
  quantity  INTEGER NOT NULL CHECK (quantity >= 1),
  UNIQUE (match_id, team_id, tank_id)
);

-- scope 'ALL' = overall equipment (everyone); otherwise a team key such as 'H0' or 'E1'.
CREATE TABLE IF NOT EXISTS match_equipment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id     INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL DEFAULT 'ALL',
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  name_id      TEXT NOT NULL,
  class_name   TEXT NOT NULL,
  slot         TEXT NOT NULL,
  tier         INTEGER NOT NULL DEFAULT 1,
  UNIQUE (match_id, scope, equipment_id)
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_id    TEXT PRIMARY KEY,
  timezone   TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   TEXT,
  actor_tag  TEXT,
  category   TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
