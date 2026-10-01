/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { timestamp } = require('../utils/formatters');
const { getLogger } = require('../utils/logger');

/** Persists audit entries to SQLite and optionally mirrors them to ADMIN_LOG_CHANNEL_ID. */
class AuditService {
  constructor(db, { config, embeds, getClient } = {}) {
    this.db = db;
    this.config = config;
    this.embeds = embeds;
    this.getClient = getClient ?? (() => null);
  }

  log(actor, { category, action, target = null, details = {} }) {
    const res = this.db
      .prepare('INSERT INTO audit_logs (actor_id, actor_tag, category, action, target, details) VALUES (?,?,?,?,?,?)')
      .run(actor?.id ?? null, actor?.tag ?? null, category, action, target, JSON.stringify(details));
    const entry = this.get(res.lastInsertRowid);
    this.notify(entry).catch((err) => getLogger().warn({ err }, 'Failed to mirror audit log to Discord'));
    return entry;
  }

  get(id) {
    return this.parse(this.db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id));
  }

  parse(row) {
    if (!row) return row;
    let details = {};
    try {
      details = JSON.parse(row.details);
    } catch {
      /* ignore */
    }
    return { ...row, details };
  }

  list({ limit = 100, offset = 0, category } = {}) {
    const rows = category
      ? this.db.prepare('SELECT * FROM audit_logs WHERE category = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(category, limit, offset)
      : this.db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    return rows.map((r) => this.parse(r));
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n;
  }

  /** Plain-text rendering in the format used by the admin log. */
  static format(entry) {
    const d = entry.details ?? {};
    const lines = [`[${entry.category} CHANGE]`, '', `Admin: ${entry.actor_id ? `<@${entry.actor_id}>` : 'system'}`];
    if (d.school) lines.push(`School: ${d.school}`);
    lines.push(`Action: ${entry.action}`);
    if (entry.target) lines.push('', `${d.targetLabel ?? 'Target'}:`, entry.target);
    if (d.previous !== undefined) lines.push('', 'Previous Quantity:', String(d.previous));
    if (d.current !== undefined) lines.push('', 'New Quantity:', String(d.current));
    const extra = Object.entries(d).filter(([k]) => !['school', 'previous', 'current', 'targetLabel'].includes(k));
    for (const [k, v] of extra) lines.push('', `${k}:`, typeof v === 'object' ? JSON.stringify(v) : String(v));
    lines.push('', 'Timestamp:', entry.created_at ?? timestamp());
    return lines.join('\n');
  }

  async notify(entry) {
    const id = this.config?.channels?.adminLog;
    const client = this.getClient();
    if (!id || !client || !this.embeds) return;
    const channel = await client.channels.fetch(id).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [this.embeds.audit(entry, AuditService.format(entry))], allowedMentions: { parse: [] } });
  }
}

module.exports = { AuditService };
