/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { normalize, parseJsonArray } = require('../utils/formatters');
const { ValidationError, schoolInput, parseOrThrow } = require('../utils/validators');

class SchoolService {
  constructor(db, { audit }) {
    this.db = db;
    this.audit = audit;
  }

  row(r) {
    return r
      ? { ...r, enabled: Boolean(r.enabled), decals: parseJsonArray(r.decals), special_requirements: parseJsonArray(r.special_requirements) }
      : null;
  }

  get(id) {
    return this.row(this.db.prepare('SELECT * FROM schools WHERE id = ?').get(id));
  }

  list({ includeDisabled = true } = {}) {
    const rows = this.db.prepare('SELECT * FROM schools ORDER BY name COLLATE NOCASE').all().map((r) => this.row(r));
    return includeDisabled ? rows : rows.filter((s) => s.enabled);
  }

  /** Resolve by id, exact name, short name, or normalised name. */
  find(query) {
    const q = String(query ?? '').trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) {
      const byId = this.get(Number(q));
      if (byId) return byId;
    }
    const n = normalize(q);
    const all = this.list();
    return all.find((s) => normalize(s.name) === n) || all.find((s) => s.short_name && normalize(s.short_name) === n) || null;
  }

  search(query, limit = 25) {
    const n = normalize(query);
    const all = this.list();
    if (!n) return all.slice(0, limit);
    return all.filter((s) => normalize(s.name).includes(n) || normalize(s.short_name).includes(n)).slice(0, limit);
  }

  add(input, actor) {
    const d = parseOrThrow(schoolInput, input);
    if (this.find(d.name) && normalize(this.find(d.name).name) === normalize(d.name)) {
      throw new ValidationError(`A school named "${d.name}" already exists.`);
    }
    const res = this.db
      .prepare('INSERT INTO schools (name, short_name, country, description, discord_role_id) VALUES (?,?,?,?,?)')
      .run(d.name, d.short_name ?? null, d.country ?? null, d.description ?? null, d.discord_role_id ?? null);
    const s = this.get(res.lastInsertRowid);
    this.audit?.log(actor, { category: 'SCHOOL', action: 'ADD_SCHOOL', target: s.name, details: { targetLabel: 'School' } });
    return s;
  }

  update(id, patch, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That school does not exist.');
    const d = parseOrThrow(schoolInput, {
      name: patch.name ?? cur.name,
      short_name: patch.short_name ?? cur.short_name,
      country: patch.country ?? cur.country,
      description: patch.description ?? cur.description,
      discord_role_id: patch.discord_role_id ?? cur.discord_role_id,
    });
    const clash = this.db.prepare('SELECT id FROM schools WHERE name = ? COLLATE NOCASE AND id <> ?').get(d.name, id);
    if (clash) throw new ValidationError(`A school named "${d.name}" already exists.`);
    const enabled = patch.enabled === undefined ? cur.enabled : patch.enabled;
    this.db
      .prepare("UPDATE schools SET name=?, short_name=?, country=?, description=?, discord_role_id=?, enabled=?, updated_at=datetime('now') WHERE id=?")
      .run(d.name, d.short_name ?? null, d.country ?? null, d.description ?? null, d.discord_role_id ?? null, enabled ? 1 : 0, id);
    const s = this.get(id);
    const changes = {};
    for (const k of ['name', 'short_name', 'country', 'description', 'discord_role_id', 'enabled']) {
      if (cur[k] !== s[k]) changes[k] = `${cur[k] ?? '-'} → ${s[k] ?? '-'}`;
    }
    this.audit?.log(actor, { category: 'SCHOOL', action: 'EDIT_SCHOOL', target: s.name, details: { targetLabel: 'School', ...changes } });
    return s;
  }

  remove(id, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That school does not exist.');
    const used = this.db.prepare('SELECT COUNT(DISTINCT match_id) AS n FROM match_teams WHERE school_id = ?').get(id).n;
    if (used) throw new ValidationError(`${cur.name} appears in ${used} match(es), so it cannot be deleted. Disable it with /school edit instead.`);
    this.db.prepare('DELETE FROM schools WHERE id = ?').run(id);
    this.audit?.log(actor, { category: 'SCHOOL', action: 'REMOVE_SCHOOL', target: cur.name, details: { targetLabel: 'School' } });
    return cur;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM schools').get().n;
  }
}

module.exports = { SchoolService };
