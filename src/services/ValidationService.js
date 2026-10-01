/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ALL_ERAS, WEAPON_CLASSES, SLOTS } = require('../../config/mtc');
const { normalize } = require('../utils/formatters');

/** Data-quality checks behind /admin validate-database. */
class ValidationService {
  constructor(db, { settings, mtc, loadouts, schools }) {
    Object.assign(this, { db, settings, mtc, loadouts, schools });
  }

  run() {
    const errors = [];
    const warnings = [];
    const q = (sql, ...a) => this.db.prepare(sql).all(...a);
    const allowed = this.settings.getAllowedEras();

    const schools = q('SELECT * FROM schools');
    const tanks = q('SELECT * FROM tanks');
    const equipment = q('SELECT * FROM equipment');

    // duplicate schools / tanks (normalised)
    const dupes = (rows, key, label, bucket) => {
      const seen = new Map();
      for (const r of rows) {
        const k = normalize(r[key]);
        if (seen.has(k)) bucket.push(`Possible duplicate ${label}: "${seen.get(k)}" and "${r[key]}".`);
        else seen.set(k, r[key]);
      }
    };
    dupes(schools, 'name', 'school', errors);
    dupes(tanks, 'display_name', 'vehicle', warnings);

    // required fields / NameIDs
    for (const s of schools) if (!String(s.name ?? '').trim()) errors.push(`School #${s.id} has no name.`);
    for (const t of tanks) {
      if (!String(t.display_name ?? '').trim()) errors.push(`Vehicle #${t.id} has no display name.`);
      if (!String(t.name_id ?? '').trim()) errors.push(`${t.display_name || `Vehicle #${t.id}`} has no MTC NameID.`);
    }

    // eras
    const flagFor = { WWI: 'is_ww1', WWII: 'is_ww2', COLD_WAR: 'is_cold_war', MODERN: 'is_modern' };
    for (const t of tanks) {
      if (!ALL_ERAS.includes(t.era)) errors.push(`${t.display_name}: invalid era "${t.era}".`);
      else if (!t[flagFor[t.era]]) warnings.push(`${t.display_name}: era flags do not match era ${t.era}.`);
      if (t.enabled && !allowed.includes(t.era)) {
        const kind = t.era === 'MODERN' ? 'Modern' : t.era === 'COLD_WAR' ? 'Cold War' : t.era;
        errors.push(`${t.display_name} is an enabled ${kind} vehicle but only ${allowed.join('/')} is permitted.`);
      }
    }

    // quantities
    for (const r of q('SELECT st.id, st.quantity, typeof(st.quantity) AS ty, s.name AS school, t.display_name AS tank FROM school_tanks st JOIN schools s ON s.id=st.school_id JOIN tanks t ON t.id=st.tank_id')) {
      if (r.ty !== 'integer' || r.quantity < 0) errors.push(`${r.school} / ${r.tank}: invalid quantity "${r.quantity}".`);
    }

    // equipment
    for (const e of equipment) {
      if (!String(e.name_id ?? '').trim()) errors.push(`Equipment "${e.name}" has no NameID.`);
      if (!WEAPON_CLASSES.includes(e.class_name) || !SLOTS.includes(e.slot)) errors.push(`Equipment "${e.name}" has invalid class/slot (${e.class_name}/${e.slot}).`);
    }
    for (const r of q('SELECT s.name AS school, e.name FROM school_equipment se JOIN schools s ON s.id=se.school_id JOIN equipment e ON e.id=se.equipment_id WHERE e.enabled = 0')) {
      warnings.push(`${r.school} owns disabled equipment "${r.name}".`);
    }

    // aliases
    const ids = new Map();
    for (const t of tanks) for (const n of [t.display_name, t.name_id]) ids.set(normalize(n), t.display_name);
    for (const t of tanks) {
      let list;
      try {
        list = JSON.parse(t.aliases);
        if (!Array.isArray(list)) throw new Error('not array');
      } catch {
        errors.push(`${t.display_name}: aliases column is not a valid JSON array.`);
        continue;
      }
      for (const a of list) {
        const owner = ids.get(normalize(a));
        if (owner && owner !== t.display_name) warnings.push(`${t.display_name}: alias "${a}" collides with vehicle "${owner}".`);
      }
    }

    // MTC mapping
    for (const s of schools) {
      try {
        const json = this.loadouts.exportMtc(s.id);
        const r = this.mtc.validateShape(json);
        if (!r.valid) errors.push(`${s.name}: generated MTC JSON is invalid (${r.errors[0]}).`);
      } catch (err) {
        errors.push(`${s.name}: could not generate MTC JSON (${err.message}).`);
      }
    }

    const tankReview = tanks.filter((t) => t.needs_review).length;
    const qtyReview = q('SELECT COUNT(*) AS n FROM school_tanks WHERE quantity_needs_review = 1')[0].n;
    const eqReview = equipment.filter((e) => e.needs_review).length;
    const review = tankReview + qtyReview + eqReview;
    return {
      counts: { schools: schools.length, tanks: tanks.length, equipment: equipment.length },
      review: { vehicles: tankReview, quantities: qtyReview, equipment: eqReview, total: review },
      errors,
      warnings,
      ok: errors.length === 0,
    };
  }

  static render(r) {
    return [
      'DATABASE VALIDATION',
      '',
      `✅ Schools: ${r.counts.schools}`,
      `✅ Tanks: ${r.counts.tanks}`,
      `✅ Equipment: ${r.counts.equipment}`,
      `⚠️ Vehicles requiring review: ${r.review.vehicles}  (quantities: ${r.review.quantities}, equipment: ${r.review.equipment})`,
      `${r.errors.length ? '❌' : '✅'} Errors: ${r.errors.length}`,
      `⚠️ Warnings: ${r.warnings.length}`,
    ].join('\n');
  }
}

module.exports = { ValidationService };
