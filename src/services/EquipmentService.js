/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { normalize, parseJsonArray } = require('../utils/formatters');
const { ValidationError, equipmentInput, parseOrThrow } = require('../utils/validators');

class EquipmentService {
  constructor(db, { audit }) {
    this.db = db;
    this.audit = audit;
  }

  row(r) {
    return r ? { ...r, aliases: parseJsonArray(r.aliases), enabled: Boolean(r.enabled), needs_review: Boolean(r.needs_review) } : null;
  }

  get(id) {
    return this.row(this.db.prepare('SELECT * FROM equipment WHERE id = ?').get(id));
  }

  list({ includeDisabled = true } = {}) {
    const rows = this.db.prepare('SELECT * FROM equipment ORDER BY name COLLATE NOCASE').all().map((r) => this.row(r));
    return includeDisabled ? rows : rows.filter((e) => e.enabled);
  }

  find(query) {
    const q = String(query ?? '').trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) {
      const byId = this.get(Number(q));
      if (byId) return byId;
    }
    const n = normalize(q);
    const all = this.list();
    return (
      all.find((e) => normalize(e.name) === n) ||
      all.find((e) => normalize(e.name_id) === n) ||
      all.find((e) => e.aliases.some((a) => normalize(a) === n)) ||
      null
    );
  }

  add(input, actor, { aliases = [], needsReview = false } = {}) {
    const d = parseOrThrow(equipmentInput, input);
    const dup = this.db.prepare('SELECT id FROM equipment WHERE name_id = ? AND class_name = ? AND slot = ?').get(d.name_id, d.class_name, d.slot);
    if (dup) throw new ValidationError(`${d.name_id} already exists for ${d.class_name}/${d.slot}.`);
    const res = this.db
      .prepare('INSERT INTO equipment (name, name_id, class_name, slot, tier, needs_review, aliases, notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(d.name, d.name_id, d.class_name, d.slot, d.tier, needsReview ? 1 : 0, JSON.stringify(aliases), d.notes ?? null);
    const eq = this.get(res.lastInsertRowid);
    this.audit?.log(actor, { category: 'EQUIPMENT', action: 'ADD_EQUIPMENT', target: eq.name, details: { targetLabel: 'Equipment', name_id: eq.name_id, class: eq.class_name, slot: eq.slot, tier: eq.tier } });
    return eq;
  }

  update(id, patch, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That equipment does not exist.');
    const d = parseOrThrow(equipmentInput, {
      name: patch.name ?? cur.name,
      name_id: patch.name_id ?? cur.name_id,
      class_name: patch.class_name ?? cur.class_name,
      slot: patch.slot ?? cur.slot,
      tier: patch.tier ?? cur.tier,
      notes: patch.notes ?? cur.notes,
    });
    const clash = this.db
      .prepare('SELECT id FROM equipment WHERE name_id = ? AND class_name = ? AND slot = ? AND id <> ?')
      .get(d.name_id, d.class_name, d.slot, id);
    if (clash) throw new ValidationError('Another equipment entry already uses that NameID/class/slot.');
    this.db
      .prepare("UPDATE equipment SET name=?, name_id=?, class_name=?, slot=?, tier=?, notes=?, needs_review=0, enabled=?, updated_at=datetime('now') WHERE id=?")
      .run(d.name, d.name_id, d.class_name, d.slot, d.tier, d.notes ?? null, patch.enabled === undefined ? (cur.enabled ? 1 : 0) : patch.enabled ? 1 : 0, id);
    const eq = this.get(id);
    const changes = {};
    for (const k of ['name', 'name_id', 'class_name', 'slot', 'tier']) if (cur[k] !== eq[k]) changes[k] = `${cur[k]} → ${eq[k]}`;
    this.audit?.log(actor, { category: 'EQUIPMENT', action: 'EDIT_EQUIPMENT', target: eq.name, details: { targetLabel: 'Equipment', ...changes } });
    return eq;
  }

  remove(id, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That equipment does not exist.');
    const used = this.db.prepare('SELECT COUNT(*) AS n FROM match_equipment WHERE equipment_id = ?').get(id).n;
    if (used) throw new ValidationError(`${cur.name} is referenced by ${used} match record(s). Disable it instead (/admin equipment-edit).`);
    this.db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
    this.audit?.log(actor, { category: 'EQUIPMENT', action: 'REMOVE_EQUIPMENT', target: cur.name, details: { targetLabel: 'Equipment' } });
    return cur;
  }

  /** Create entry for equipment only seen in school data (class/slot unverified). */
  createUnverified(name, actor) {
    return this.add(
      { name, name_id: name, class_name: 'Crewman', slot: 'PassiveTools', tier: 1, notes: 'Created automatically from school data - verify class, slot and NameID.' },
      actor,
      { needsReview: true },
    );
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM equipment').get().n;
  }
}

module.exports = { EquipmentService };
