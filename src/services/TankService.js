/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { normalize, parseJsonArray } = require('../utils/formatters');
const { ValidationError, tankInput, parseOrThrow } = require('../utils/validators');

const ERA_FLAGS = {
  WWI: { is_ww1: 1, is_ww2: 0, is_cold_war: 0, is_modern: 0 },
  WWII: { is_ww1: 0, is_ww2: 1, is_cold_war: 0, is_modern: 0 },
  COLD_WAR: { is_ww1: 0, is_ww2: 0, is_cold_war: 1, is_modern: 0 },
  MODERN: { is_ww1: 0, is_ww2: 0, is_cold_war: 0, is_modern: 1 },
};

class TankService {
  constructor(db, { audit, settings }) {
    this.db = db;
    this.audit = audit;
    this.settings = settings;
  }

  row(r) {
    return r ? { ...r, aliases: parseJsonArray(r.aliases), enabled: Boolean(r.enabled), needs_review: Boolean(r.needs_review) } : null;
  }

  get(id) {
    return this.row(this.db.prepare('SELECT * FROM tanks WHERE id = ?').get(id));
  }

  /** Resolve by numeric id, or by (normalised) display name / NameID / alias. */
  find(query) {
    const q = String(query ?? '').trim();
    if (!q) return null;
    if (/^\d+$/.test(q)) {
      const byId = this.get(Number(q));
      if (byId) return byId;
    }
    const n = normalize(q);
    const all = this.db.prepare('SELECT * FROM tanks').all().map((r) => this.row(r));
    return (
      all.find((t) => normalize(t.display_name) === n) ||
      all.find((t) => normalize(t.name_id) === n) ||
      all.find((t) => t.aliases.some((a) => normalize(a) === n)) ||
      null
    );
  }

  /** Exact (case/whitespace-insensitive) lookup - no punctuation folding, so "T-34 (85)" is NOT "T-34-85". */
  findExact(query) {
    const clean = (x) => String(x ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    const q = clean(query);
    if (!q) return null;
    const all = this.db.prepare('SELECT * FROM tanks').all().map((r) => this.row(r));
    return (
      all.find((t) => clean(t.display_name) === q) ||
      all.find((t) => clean(t.name_id) === q) ||
      all.find((t) => t.aliases.some((a) => clean(a) === q)) ||
      null
    );
  }

  assertEraAllowed(era) {
    const allowed = this.settings.getAllowedEras();
    if (!allowed.includes(era)) {
      throw new ValidationError(`Vehicles from era ${era} are not permitted (allowed: ${allowed.join(', ')}).`);
    }
  }

  add(input, actor, { aliases = [], needsReview = false, skipEraCheck = false } = {}) {
    const data = parseOrThrow(tankInput, input);
    if (!skipEraCheck) this.assertEraAllowed(data.era);
    if (this.find(data.display_name)?.display_name?.toLowerCase() === data.display_name.toLowerCase()) {
      throw new ValidationError(`A vehicle called "${data.display_name}" already exists.`);
    }
    const flags = ERA_FLAGS[data.era];
    const res = this.db
      .prepare(
        `INSERT INTO tanks (name, display_name, name_id, nation, era, vehicle_type, tier, year_introduced,
          is_ww1, is_ww2, is_cold_war, is_modern, needs_review, aliases, notes)
         VALUES (@name, @display_name, @name_id, @nation, @era, @vehicle_type, @tier, @year_introduced,
          @is_ww1, @is_ww2, @is_cold_war, @is_modern, @needs_review, @aliases, @notes)`,
      )
      .run({
        name: data.display_name.toLowerCase(),
        display_name: data.display_name,
        name_id: data.name_id,
        nation: data.nation ?? null,
        era: data.era,
        vehicle_type: data.vehicle_type ?? null,
        tier: data.tier,
        year_introduced: data.year_introduced ?? null,
        ...flags,
        needs_review: needsReview ? 1 : 0,
        aliases: JSON.stringify(aliases),
        notes: data.notes ?? null,
      });
    const tank = this.get(res.lastInsertRowid);
    this.audit?.log(actor, { category: 'TANK', action: 'ADD_TANK', target: tank.display_name, details: { targetLabel: 'Vehicle', name_id: tank.name_id, era: tank.era } });
    return tank;
  }

  update(id, patch, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That vehicle does not exist.');
    const merged = parseOrThrow(tankInput, {
      display_name: patch.display_name ?? cur.display_name,
      name_id: patch.name_id ?? cur.name_id,
      nation: patch.nation ?? cur.nation,
      era: patch.era ?? cur.era,
      vehicle_type: patch.vehicle_type ?? cur.vehicle_type,
      tier: patch.tier ?? cur.tier,
      year_introduced: patch.year_introduced ?? cur.year_introduced,
      notes: patch.notes ?? cur.notes,
    });
    if (merged.era !== cur.era) this.assertEraAllowed(merged.era);
    const clash = this.db.prepare('SELECT id FROM tanks WHERE display_name = ? COLLATE NOCASE AND id <> ?').get(merged.display_name, id);
    if (clash) throw new ValidationError(`A vehicle called "${merged.display_name}" already exists.`);
    const aliases = patch.aliases ?? cur.aliases;
    this.db
      .prepare(
        `UPDATE tanks SET name=@name, display_name=@display_name, name_id=@name_id, nation=@nation, era=@era,
          vehicle_type=@vehicle_type, tier=@tier, year_introduced=@year_introduced,
          is_ww1=@is_ww1, is_ww2=@is_ww2, is_cold_war=@is_cold_war, is_modern=@is_modern,
          needs_review=@needs_review, aliases=@aliases, notes=@notes, updated_at=datetime('now') WHERE id=@id`,
      )
      .run({
        id,
        name: merged.display_name.toLowerCase(),
        display_name: merged.display_name,
        name_id: merged.name_id,
        nation: merged.nation ?? null,
        era: merged.era,
        vehicle_type: merged.vehicle_type ?? null,
        tier: merged.tier,
        year_introduced: merged.year_introduced ?? null,
        ...ERA_FLAGS[merged.era],
        needs_review: patch.name_id !== undefined || patch.markReviewed ? 0 : cur.needs_review ? 1 : 0,
        aliases: JSON.stringify(aliases),
        notes: merged.notes ?? null,
      });
    const tank = this.get(id);
    const changes = {};
    for (const k of ['display_name', 'name_id', 'nation', 'era', 'vehicle_type', 'tier', 'year_introduced', 'notes']) {
      if (cur[k] !== tank[k]) changes[k] = `${cur[k] ?? '-'} → ${tank[k] ?? '-'}`;
    }
    this.audit?.log(actor, { category: 'TANK', action: 'EDIT_TANK', target: tank.display_name, details: { targetLabel: 'Vehicle', ...changes } });
    return tank;
  }

  remove(id, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That vehicle does not exist.');
    const inUse = this.db.prepare('SELECT COUNT(*) AS n FROM school_tanks WHERE tank_id = ?').get(id).n;
    const inMatches = this.db.prepare('SELECT COUNT(*) AS n FROM match_vehicles WHERE tank_id = ?').get(id).n;
    if (inUse || inMatches) {
      throw new ValidationError(
        `${cur.display_name} is used by ${inUse} school inventor${inUse === 1 ? 'y' : 'ies'} and ${inMatches} match entr${inMatches === 1 ? 'y' : 'ies'}. Remove it from those first, or disable it instead.`,
      );
    }
    this.db.prepare('DELETE FROM tanks WHERE id = ?').run(id);
    this.audit?.log(actor, { category: 'TANK', action: 'REMOVE_TANK', target: cur.display_name, details: { targetLabel: 'Vehicle' } });
    return cur;
  }

  setEnabled(id, enabled, actor) {
    const cur = this.get(id);
    if (!cur) throw new ValidationError('That vehicle does not exist.');
    this.db.prepare("UPDATE tanks SET enabled = ?, updated_at = datetime('now') WHERE id = ?").run(enabled ? 1 : 0, id);
    this.audit?.log(actor, { category: 'TANK', action: enabled ? 'ENABLE_TANK' : 'DISABLE_TANK', target: cur.display_name, details: { targetLabel: 'Vehicle' } });
    return this.get(id);
  }

  /** Create a catalogue entry for a vehicle only seen in school data (flagged for admin review). */
  createUnverified(displayName, nameId, actor) {
    const allowed = this.settings.getAllowedEras();
    return this.add(
      {
        display_name: displayName,
        name_id: nameId || displayName,
        era: allowed.includes('WWII') ? 'WWII' : allowed[0],
        tier: 1,
        notes: 'Created automatically from school data - verify NameID, nation, era and type.',
      },
      actor,
      { needsReview: true },
    );
  }

  list({ nation, era, vehicle_type, includeDisabled = true } = {}) {
    let rows = this.db.prepare('SELECT * FROM tanks ORDER BY display_name COLLATE NOCASE').all().map((r) => this.row(r));
    if (!includeDisabled) rows = rows.filter((t) => t.enabled);
    if (nation) rows = rows.filter((t) => normalize(t.nation) === normalize(nation));
    if (era) rows = rows.filter((t) => t.era === era);
    if (vehicle_type) rows = rows.filter((t) => normalize(t.vehicle_type).includes(normalize(vehicle_type)));
    return rows;
  }

  search(query, { limit = 25, includeDisabled = true } = {}) {
    const tokens = String(query ?? '').toLowerCase().split(/\s+/).map(normalize).filter(Boolean);
    if (!tokens.length) return [];
    const whole = normalize(query);
    const scored = [];
    for (const t of this.list({ includeDisabled })) {
      const dn = normalize(t.display_name);
      const nid = normalize(t.name_id);
      const aliasN = t.aliases.map(normalize);
      const hay = [dn, nid, ...aliasN, normalize(t.nation), normalize(t.vehicle_type)].join('|');
      if (!tokens.every((tok) => hay.includes(tok))) continue;
      let score = 10;
      if (dn === whole || nid === whole) score = 100;
      else if (dn.startsWith(whole) || nid.startsWith(whole)) score = 80;
      else if (dn.includes(whole) || nid.includes(whole)) score = 60;
      else if (aliasN.some((a) => a.includes(whole))) score = 40;
      scored.push({ t, score });
    }
    scored.sort((a, b) => b.score - a.score || a.t.display_name.localeCompare(b.t.display_name));
    return scored.slice(0, limit).map((s) => s.t);
  }

  nations() {
    return this.db.prepare("SELECT DISTINCT nation FROM tanks WHERE nation IS NOT NULL AND nation <> '' ORDER BY nation").all().map((r) => r.nation);
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM tanks').get().n;
  }
}

module.exports = { TankService, ERA_FLAGS };
