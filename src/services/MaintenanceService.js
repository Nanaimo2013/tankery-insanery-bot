/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { EventEmitter } = require('node:events');

const KEY = 'maintenance';

/**
 * "Down for maintenance" switch. Controlled from the console only (see src/console.js).
 * The state is stored in bot_config so a restart keeps the bot in maintenance until you turn it off.
 * Emits 'change' with the new state so the Discord presence can follow.
 */
class MaintenanceService extends EventEmitter {
  constructor(db, { audit } = {}) {
    super();
    this.db = db;
    this.audit = audit;
    this.state = this.read();
  }

  read() {
    try {
      const row = this.db.prepare('SELECT value FROM bot_config WHERE key = ?').get(KEY);
      const v = row ? JSON.parse(row.value) : null;
      if (v && typeof v === 'object') return { enabled: Boolean(v.enabled), reason: v.reason ?? null, since: v.since ?? null };
    } catch {
      /* fall through */
    }
    return { enabled: false, reason: null, since: null };
  }

  persist() {
    this.db
      .prepare("INSERT INTO bot_config (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(KEY, JSON.stringify(this.state));
  }

  /** Re-read the stored flag (lets `npm run maintenance` from another process reach the running bot). */
  sync() {
    const next = this.read();
    if (next.enabled !== this.state.enabled || next.reason !== this.state.reason) {
      this.state = next;
      this.emit('change', this.status());
    }
  }

  isEnabled() {
    return this.state.enabled;
  }

  status() {
    return { ...this.state };
  }

  enable(reason = null) {
    this.state = { enabled: true, reason: reason ? String(reason).trim().slice(0, 300) || null : null, since: Math.floor(Date.now() / 1000) };
    this.persist();
    this.audit?.log({ id: null, tag: 'console' }, { category: 'CONFIG', action: 'MAINTENANCE_ON', target: this.state.reason ?? '-', details: { targetLabel: 'Reason' } });
    this.emit('change', this.status());
    return this.status();
  }

  disable() {
    this.state = { enabled: false, reason: null, since: null };
    this.persist();
    this.audit?.log({ id: null, tag: 'console' }, { category: 'CONFIG', action: 'MAINTENANCE_OFF', target: '-', details: { targetLabel: 'Maintenance' } });
    this.emit('change', this.status());
    return this.status();
  }
}

module.exports = { MaintenanceService };
