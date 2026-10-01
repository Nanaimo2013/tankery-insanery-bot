/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ALL_ERAS, DEFAULT_ALLOWED_ERAS } = require('../../config/mtc');
const { ValidationError } = require('../utils/validators');
const { resolveZone } = require('../utils/time');

/** Runtime settings stored in the bot_config table (editable via /admin config and /admin equipment base). */
class SettingsService {
  constructor(db, { audit } = {}) {
    this.db = db;
    this.audit = audit;
  }

  raw(key) {
    return this.db.prepare('SELECT value FROM bot_config WHERE key = ?').get(key)?.value;
  }

  write(key, value) {
    this.db
      .prepare("INSERT INTO bot_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(key, value);
  }

  getAllowedEras() {
    try {
      const v = JSON.parse(this.raw('allowed_eras') ?? 'null');
      if (Array.isArray(v) && v.length) return v.filter((e) => ALL_ERAS.includes(e));
    } catch {
      /* fall through */
    }
    return [...DEFAULT_ALLOWED_ERAS];
  }

  /** Equipment ids that every match gets in the "overall" (all teams) section by default - the basics. */
  getBaseEquipmentIds() {
    try {
      const v = JSON.parse(this.raw('base_equipment') ?? '[]');
      return Array.isArray(v) ? v.filter(Number.isInteger) : [];
    } catch {
      return [];
    }
  }

  setBaseEquipmentIds(ids, actor, label = 'base equipment') {
    const clean = [...new Set(ids.filter(Number.isInteger))].sort((a, b) => a - b);
    const previous = this.raw('base_equipment');
    this.write('base_equipment', JSON.stringify(clean));
    this.audit?.log(actor, { category: 'CONFIG', action: 'SET_BASE_EQUIPMENT', target: label, details: { targetLabel: 'Setting', previous, current: JSON.stringify(clean) } });
    return clean;
  }

  all() {
    return { allowed_eras: this.getAllowedEras(), base_equipment: this.getBaseEquipmentIds() };
  }

  set(key, value, actor) {
    if (key !== 'allowed_eras') throw new ValidationError(`Unknown setting "${key}".`);
    const eras = String(value)
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase().replace('-', '_'))
      .filter(Boolean);
    if (!eras.length || eras.some((e) => !ALL_ERAS.includes(e))) {
      throw new ValidationError(`allowed_eras must be a comma-separated list of: ${ALL_ERAS.join(', ')}`);
    }
    const stored = JSON.stringify([...new Set(eras)]);
    const previous = this.raw(key);
    this.write(key, stored);
    this.audit?.log(actor, { category: 'CONFIG', action: 'SET_CONFIG', target: key, details: { targetLabel: 'Setting', previous, current: stored } });
    return stored;
  }

  // ---------------------------------------------------------------- per-user preferences
  getUserTimezone(userId) {
    return this.db.prepare('SELECT timezone FROM user_prefs WHERE user_id = ?').get(String(userId))?.timezone ?? null;
  }

  setUserTimezone(userId, timezone) {
    const label = resolveZone(timezone).label;
    this.db
      .prepare("INSERT INTO user_prefs (user_id, timezone, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at")
      .run(String(userId), String(timezone).trim());
    return label;
  }
}

module.exports = { SettingsService };
