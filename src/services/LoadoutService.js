/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ValidationError, importFile, parseOrThrow } = require('../utils/validators');
const { parseJsonArray } = require('../utils/formatters');

/** Permanent school inventories: tanks, equipment, camouflage, requirements. */
class LoadoutService {
  constructor(db, { schools, tanks, equipment, mtc, audit, settings }) {
    this.db = db;
    this.schools = schools;
    this.tanks = tanks;
    this.equipment = equipment;
    this.mtc = mtc;
    this.audit = audit;
    this.settings = settings;
  }

  requireSchool(id) {
    const s = this.schools.get(id);
    if (!s) throw new ValidationError('That school does not exist.');
    return s;
  }

  requireTank(id) {
    const t = this.tanks.get(id);
    if (!t) throw new ValidationError('That vehicle does not exist.');
    return t;
  }

  getEntry(schoolId, tankId) {
    return this.db.prepare('SELECT * FROM school_tanks WHERE school_id = ? AND tank_id = ?').get(schoolId, tankId);
  }

  getLoadout(schoolId) {
    const school = this.requireSchool(schoolId);
    const tanks = this.db
      .prepare(
        `SELECT st.id AS entry_id, st.tank_id, st.quantity, st.quantity_needs_review, st.special_requirements, st.notes AS entry_notes,
                t.display_name, t.name_id, t.tier, t.enabled, t.era, t.nation, t.vehicle_type, t.needs_review
         FROM school_tanks st JOIN tanks t ON t.id = st.tank_id
         WHERE st.school_id = ? ORDER BY t.display_name COLLATE NOCASE`,
      )
      .all(schoolId)
      .map((r) => ({ ...r, enabled: Boolean(r.enabled), quantity_needs_review: Boolean(r.quantity_needs_review), needs_review: Boolean(r.needs_review) }));
    const equipment = this.db
      .prepare(
        `SELECT e.* FROM school_equipment se JOIN equipment e ON e.id = se.equipment_id
         WHERE se.school_id = ? ORDER BY e.name COLLATE NOCASE`,
      )
      .all(schoolId)
      .map((r) => this.equipment.row(r));
    const camos = this.db.prepare('SELECT camo_name FROM school_camos WHERE school_id = ? ORDER BY camo_name COLLATE NOCASE').all(schoolId).map((r) => r.camo_name);
    return { school, tanks, equipment, camos, decals: school.decals, special_requirements: school.special_requirements };
  }

  /**
   * Why a school vehicle cannot be brought to a match (null = it can).
   * Vehicles flagged needs_review have no verified MTC NameID, so they can never be exported.
   */
  matchBlocker(t, { tierCap = null } = {}) {
    const allowed = this.settings.getAllowedEras();
    if (!(t.quantity > 0)) return 'none owned';
    if (!t.enabled) return 'disabled';
    if (!allowed.includes(t.era)) return 'era not permitted';
    if (t.needs_review) return 'no MTC NameID';
    if (tierCap !== null && tierCap !== undefined && t.tier > tierCap) return `tier ${t.tier} is above the limit`;
    return null;
  }

  /** Vehicles a referee may actually pick: owned, enabled, era allowed, valid MTC NameID, within the tier limit. */
  availableForMatch(schoolId, { tierCap = null } = {}) {
    return this.getLoadout(schoolId).tanks.filter((t) => !this.matchBlocker(t, { tierCap }));
  }

  /** Owned vehicles that are left out of a match, with the reason (for display). */
  blockedForMatch(schoolId, { tierCap = null } = {}) {
    return this.getLoadout(schoolId)
      .tanks.map((t) => ({ tank: t, reason: this.matchBlocker(t, { tierCap }) }))
      .filter((x) => x.reason && x.reason !== 'none owned');
  }

  addTank(schoolId, tankId, quantity, actor, { requirement } = {}) {
    const school = this.requireSchool(schoolId);
    const tank = this.requireTank(tankId);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new ValidationError('Quantity must be a whole number from 1 to 9999.');
    this.tanks.assertEraAllowed(tank.era);
    const prev = this.getEntry(schoolId, tankId)?.quantity ?? 0;
    const next = prev + quantity;
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO school_tanks (school_id, tank_id, quantity, quantity_needs_review, special_requirements) VALUES (?,?,?,0,?)
           ON CONFLICT(school_id, tank_id) DO UPDATE SET quantity = excluded.quantity, quantity_needs_review = 0,
             special_requirements = COALESCE(excluded.special_requirements, special_requirements), updated_at = datetime('now')`,
        )
        .run(schoolId, tankId, next, requirement ?? null);
    })();
    this.audit?.log(actor, { category: 'LOADOUT', action: 'ADD_TANK', target: tank.display_name, details: { targetLabel: 'Vehicle', school: school.name, previous: prev, current: next } });
    return { school, tank, previous: prev, current: next };
  }

  setQuantity(schoolId, tankId, quantity, actor) {
    const school = this.requireSchool(schoolId);
    const tank = this.requireTank(tankId);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 9999) throw new ValidationError('Quantity must be a whole number from 0 to 9999.');
    if (quantity > 0) this.tanks.assertEraAllowed(tank.era);
    const prev = this.getEntry(schoolId, tankId)?.quantity ?? 0;
    this.db
      .prepare(
        `INSERT INTO school_tanks (school_id, tank_id, quantity, quantity_needs_review) VALUES (?,?,?,0)
         ON CONFLICT(school_id, tank_id) DO UPDATE SET quantity = excluded.quantity, quantity_needs_review = 0, updated_at = datetime('now')`,
      )
      .run(schoolId, tankId, quantity);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'SET_QUANTITY', target: tank.display_name, details: { targetLabel: 'Vehicle', school: school.name, previous: prev, current: quantity } });
    return { school, tank, previous: prev, current: quantity };
  }

  /** Remove `quantity` of a vehicle, or the whole entry when quantity is omitted. */
  removeTank(schoolId, tankId, quantity, actor) {
    const school = this.requireSchool(schoolId);
    const tank = this.requireTank(tankId);
    const entry = this.getEntry(schoolId, tankId);
    if (!entry) throw new ValidationError(`${school.name} does not have ${tank.display_name}.`);
    let next = 0;
    if (quantity !== undefined && quantity !== null) {
      if (!Number.isInteger(quantity) || quantity < 1) throw new ValidationError('Quantity must be a positive whole number.');
      next = Math.max(0, entry.quantity - quantity);
    }
    if (next === 0) this.db.prepare('DELETE FROM school_tanks WHERE id = ?').run(entry.id);
    else this.db.prepare("UPDATE school_tanks SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(next, entry.id);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'REMOVE_TANK', target: tank.display_name, details: { targetLabel: 'Vehicle', school: school.name, previous: entry.quantity, current: next } });
    return { school, tank, previous: entry.quantity, current: next };
  }

  setRequirement(schoolId, tankId, text, actor) {
    const school = this.requireSchool(schoolId);
    const value = text && text.trim() ? text.trim().slice(0, 500) : null;
    if (tankId) {
      const tank = this.requireTank(tankId);
      const entry = this.getEntry(schoolId, tankId);
      if (!entry) throw new ValidationError(`${school.name} does not have ${tank.display_name}.`);
      this.db.prepare("UPDATE school_tanks SET special_requirements = ?, updated_at = datetime('now') WHERE id = ?").run(value, entry.id);
      this.audit?.log(actor, { category: 'LOADOUT', action: 'SET_REQUIREMENT', target: tank.display_name, details: { targetLabel: 'Vehicle', school: school.name, requirement: value ?? '(cleared)' } });
      return { school, tank, value };
    }
    const list = value ? [value] : [];
    const merged = value ? [...school.special_requirements, value] : [];
    this.db.prepare("UPDATE schools SET special_requirements = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(value ? merged : list), schoolId);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'SET_REQUIREMENT', target: school.name, details: { targetLabel: 'School', requirement: value ?? '(all cleared)' } });
    return { school, value };
  }

  addEquipment(schoolId, equipmentId, actor) {
    const school = this.requireSchool(schoolId);
    const eq = this.equipment.get(equipmentId);
    if (!eq) throw new ValidationError('That equipment does not exist.');
    const res = this.db.prepare('INSERT OR IGNORE INTO school_equipment (school_id, equipment_id) VALUES (?,?)').run(schoolId, equipmentId);
    if (!res.changes) throw new ValidationError(`${school.name} already has ${eq.name}.`);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'ADD_EQUIPMENT', target: eq.name, details: { targetLabel: 'Equipment', school: school.name } });
    return { school, equipment: eq };
  }

  removeEquipment(schoolId, equipmentId, actor) {
    const school = this.requireSchool(schoolId);
    const eq = this.equipment.get(equipmentId);
    if (!eq) throw new ValidationError('That equipment does not exist.');
    const res = this.db.prepare('DELETE FROM school_equipment WHERE school_id = ? AND equipment_id = ?').run(schoolId, equipmentId);
    if (!res.changes) throw new ValidationError(`${school.name} does not have ${eq.name}.`);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'REMOVE_EQUIPMENT', target: eq.name, details: { targetLabel: 'Equipment', school: school.name } });
    return { school, equipment: eq };
  }

  addCamo(schoolId, camo, actor) {
    const school = this.requireSchool(schoolId);
    const name = String(camo ?? '').trim();
    if (!name || name.length > 100) throw new ValidationError('Camouflage name must be 1–100 characters.');
    const res = this.db.prepare('INSERT OR IGNORE INTO school_camos (school_id, camo_name) VALUES (?,?)').run(schoolId, name);
    if (!res.changes) throw new ValidationError(`${school.name} already has the camouflage "${name}".`);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'ADD_CAMO', target: name, details: { targetLabel: 'Camouflage', school: school.name } });
    return { school, camo: name };
  }

  removeCamo(schoolId, camo, actor) {
    const school = this.requireSchool(schoolId);
    const res = this.db.prepare('DELETE FROM school_camos WHERE school_id = ? AND camo_name = ? COLLATE NOCASE').run(schoolId, String(camo).trim());
    if (!res.changes) throw new ValidationError(`${school.name} does not have the camouflage "${camo}".`);
    this.audit?.log(actor, { category: 'LOADOUT', action: 'REMOVE_CAMO', target: String(camo).trim(), details: { targetLabel: 'Camouflage', school: school.name } });
    return { school, camo };
  }

  /** A school's whole permanent loadout as MTC JSON for one team ('H' = Hawk Republic, 'E' = Eagle Federation). */
  exportMtc(schoolId, side = 'H') {
    const l = this.getLoadout(schoolId);
    return this.mtc.buildLoadout({
      teams: [
        {
          side,
          vehicles: l.tanks.filter((t) => !this.matchBlocker(t)).map((t) => ({ name_id: t.name_id, quantity: t.quantity })),
          equipment: l.equipment.filter((e) => e.enabled && !e.needs_review),
        },
      ],
      overall: [],
    });
  }

  /** Round-trippable record in the same format /school import accepts. */
  exportRaw(schoolId) {
    const l = this.getLoadout(schoolId);
    return {
      schools: [
        {
          name: l.school.name,
          short_name: l.school.short_name,
          country: l.school.country,
          description: l.school.description,
          discord_role_id: l.school.discord_role_id,
          enabled: l.school.enabled,
          notes: l.school.notes,
          camo: l.camos,
          decals: l.decals,
          special_requirements: l.special_requirements,
          tanks: l.tanks.map((t) => ({
            name: t.display_name,
            name_id: t.name_id,
            quantity: t.quantity_needs_review ? null : t.quantity,
            notes: t.entry_notes,
            special_requirements: t.special_requirements,
          })),
          equipment: l.equipment.map((e) => e.name),
        },
      ],
    };
  }

  exportAllRaw() {
    return { schools: this.schools.list().flatMap((s) => this.exportRaw(s.id).schools) };
  }

  /**
   * Import school records. Everything runs in ONE transaction: either the whole file is applied or nothing is.
   * Vehicles/equipment not found in the catalogue are created flagged "needs_review" (never silently renamed).
   */
  importData(data, { replace = false, actor = null } = {}) {
    const parsed = parseOrThrow(importFile, data);
    const summary = { schools: 0, schoolsCreated: 0, tanksCreated: 0, equipmentCreated: 0, entries: 0, quantityReview: 0 };
    const silent = null; // sub-service audit entries are suppressed; one summary entry is written below
    const savedAudit = { tanks: this.tanks.audit, equipment: this.equipment.audit };
    this.tanks.audit = undefined;
    this.equipment.audit = undefined;
    try {
      this.db.transaction(() => {
        for (const s of parsed.schools) {
          let school = this.db.prepare('SELECT * FROM schools WHERE name = ? COLLATE NOCASE').get(s.name);
          if (!school) {
            const res = this.db
              .prepare('INSERT INTO schools (name, short_name, country, description, discord_role_id, notes) VALUES (?,?,?,?,?,?)')
              .run(s.name, s.short_name ?? null, s.country ?? null, s.description ?? null, s.discord_role_id ?? null, s.notes ?? null);
            school = this.db.prepare('SELECT * FROM schools WHERE id = ?').get(res.lastInsertRowid);
            summary.schoolsCreated += 1;
          } else {
            this.db
              .prepare(
                `UPDATE schools SET short_name = COALESCE(?, short_name), country = COALESCE(?, country), description = COALESCE(?, description),
                 discord_role_id = COALESCE(?, discord_role_id), notes = COALESCE(?, notes), enabled = COALESCE(?, enabled), updated_at = datetime('now') WHERE id = ?`,
              )
              .run(s.short_name ?? null, s.country ?? null, s.description ?? null, s.discord_role_id ?? null, s.notes ?? null, s.enabled === undefined ? null : s.enabled ? 1 : 0, school.id);
          }
          summary.schools += 1;
          if (replace) {
            this.db.prepare('DELETE FROM school_tanks WHERE school_id = ?').run(school.id);
            this.db.prepare('DELETE FROM school_equipment WHERE school_id = ?').run(school.id);
            this.db.prepare('DELETE FROM school_camos WHERE school_id = ?').run(school.id);
          }
          const decals = replace ? s.decals : [...new Set([...parseJsonArray(school.decals), ...s.decals])];
          const reqs = replace ? s.special_requirements : [...new Set([...parseJsonArray(school.special_requirements), ...s.special_requirements])];
          this.db.prepare('UPDATE schools SET decals = ?, special_requirements = ? WHERE id = ?').run(JSON.stringify(decals), JSON.stringify(reqs), school.id);

          for (const t of s.tanks) {
            let tank = this.tanks.findExact(t.name) ?? (t.name_id ? this.tanks.findExact(t.name_id) : null);
            if (!tank) {
              tank = this.tanks.createUnverified(t.name, t.name_id, silent);
              summary.tanksCreated += 1;
            }
            const unknown = t.quantity === null || t.quantity === undefined;
            if (unknown) summary.quantityReview += 1;
            this.db
              .prepare(
                `INSERT INTO school_tanks (school_id, tank_id, quantity, quantity_needs_review, special_requirements, notes) VALUES (?,?,?,?,?,?)
                 ON CONFLICT(school_id, tank_id) DO UPDATE SET
                   quantity = CASE WHEN ? THEN quantity ELSE excluded.quantity END,
                   quantity_needs_review = CASE WHEN ? THEN 1 ELSE 0 END,
                   special_requirements = COALESCE(excluded.special_requirements, special_requirements),
                   notes = COALESCE(excluded.notes, notes), updated_at = datetime('now')`,
              )
              .run(school.id, tank.id, unknown ? 0 : t.quantity, unknown ? 1 : 0, t.special_requirements ?? null, t.notes ?? null, unknown ? 1 : 0, unknown ? 1 : 0);
            summary.entries += 1;
          }
          for (const name of s.equipment) {
            let eq = this.equipment.find(name);
            if (!eq) {
              eq = this.equipment.createUnverified(name, silent);
              summary.equipmentCreated += 1;
            }
            this.db.prepare('INSERT OR IGNORE INTO school_equipment (school_id, equipment_id) VALUES (?,?)').run(school.id, eq.id);
          }
          for (const camo of s.camo) this.db.prepare('INSERT OR IGNORE INTO school_camos (school_id, camo_name) VALUES (?,?)').run(school.id, camo);
        }
      })();
    } finally {
      this.tanks.audit = savedAudit.tanks;
      this.equipment.audit = savedAudit.equipment;
    }
    this.audit?.log(actor, { category: 'LOADOUT', action: replace ? 'IMPORT_REPLACE' : 'IMPORT_MERGE', target: `${summary.schools} school(s)`, details: { targetLabel: 'Import', ...summary } });
    return summary;
  }
}

module.exports = { LoadoutService };
