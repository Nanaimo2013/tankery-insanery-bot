/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { DEFAULT_ALLOWED_ERAS } = require('../../config/mtc');

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

class DatabaseVersionError extends Error {}

/** Databases made by v1.0 (Side A/B matches) cannot be upgraded in place - they must be re-seeded. */
function assertCompatible(db) {
  const cols = db.prepare("PRAGMA table_info('matches')").all().map((c) => c.name);
  if (cols.length && !cols.includes('hawk_count')) {
    throw new DatabaseVersionError(
      'This database was created by an older version of Tankery Insanery (Side A/B matches).\n' +
        'Run `npm run reseed` once: it backs the old file up, then rebuilds the database with the correct schools and loadouts.',
    );
  }
}

/** Open (and create/upgrade) the SQLite database. Pass ':memory:' for tests. */
function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try {
    assertCompatible(db);
  } catch (err) {
    db.close();
    throw err;
  }
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  runMigrations(db);
  seedDefaultConfig(db);
  return db;
}

function runMigrations(db) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return;
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
    })();
  }
}

function seedDefaultConfig(db) {
  const ins = db.prepare('INSERT OR IGNORE INTO bot_config (key, value) VALUES (?, ?)');
  ins.run('allowed_eras', JSON.stringify(DEFAULT_ALLOWED_ERAS));
}

module.exports = { openDatabase, DatabaseVersionError };
