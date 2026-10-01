/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { z } = require('zod');
const { emptyLoadout, WEAPON_CLASSES, SLOTS, OUTPUT_TIER, MTC_TEAMS, MANDATORY_EQUIPMENT } = require('../../config/mtc');
const { SIDES } = require('../../config/matches');

const equipEntry = z.object({ NameID: z.string().min(1), Tier: z.number().int().min(0) }).strict();
const vehicleEntry = z.object({ NameID: z.string().min(1), Tier: z.number().int().min(0), LimitPerTeam: z.number().int().min(1) }).strict();
const slotsShape = z.object(Object.fromEntries(SLOTS.map((s) => [s, z.array(equipEntry)]))).strict();
const classesShape = z.object(Object.fromEntries(WEAPON_CLASSES.map((c) => [c, slotsShape]))).strict();
const loadoutSchema = z
  .object({
    WeaponClasses: z.object({ ...Object.fromEntries(WEAPON_CLASSES.map((c) => [c, slotsShape])), ...Object.fromEntries(MTC_TEAMS.map((t) => [t, classesShape])) }).strict(),
    Vehicles: z
      .object({
        GeneralLoadout: z.array(vehicleEntry),
        TeamSpecificLoadout: z.object(Object.fromEntries(MTC_TEAMS.map((t) => [t, z.array(vehicleEntry).optional()]))).strict(),
      })
      .strict(),
  })
  .strict();

/** Builds and validates MTC-compatible loadout JSON. Pure - no database access. */
class MTCService {
  /**
   * @param {object} p
   * @param {{side:'H'|'E', vehicles:{name_id:string,quantity:number}[], equipment:{name_id:string,class_name:string,slot:string}[]}[]} p.teams
   *        one entry per school; schools on the same side are merged into that side's team section
   * @param {{name_id:string,class_name:string,slot:string}[]} [p.overall] equipment given to everyone ("the basics")
   */
  buildLoadout({ teams, overall = [] }) {
    const out = emptyLoadout();
    const key = (cls, slot, id) => `${cls}|${slot}|${id}`;

    // Overall equipment: mandatory tools first, then the match's basics (de-duplicated).
    const overallSeen = new Set();
    const put = (list, cls, slot, id) => {
      const k = key(cls, slot, id);
      if (list === out.WeaponClasses && overallSeen.has(k)) return;
      list[cls][slot].push({ NameID: id, Tier: OUTPUT_TIER });
    };
    for (const m of MANDATORY_EQUIPMENT) {
      overallSeen.add(key(m.class, m.slot, m.NameID));
      out.WeaponClasses[m.class][m.slot].push({ NameID: m.NameID, Tier: OUTPUT_TIER });
    }
    for (const e of overall) {
      const k = key(e.class_name, e.slot, e.name_id);
      if (overallSeen.has(k)) continue;
      overallSeen.add(k);
      out.WeaponClasses[e.class_name][e.slot].push({ NameID: e.name_id, Tier: OUTPUT_TIER });
    }

    // Each side gets ONLY its own schools' vehicles and equipment.
    for (const code of ['E', 'H']) {
      const side = SIDES[code];
      const sideTeams = teams.filter((t) => t.side === code);
      if (!sideTeams.length) continue;
      const vehicles = new Map();
      const gear = new Set();
      for (const t of sideTeams) {
        for (const v of t.vehicles) vehicles.set(v.name_id, (vehicles.get(v.name_id) ?? 0) + v.quantity);
        for (const e of t.equipment ?? []) {
          const k = key(e.class_name, e.slot, e.name_id);
          if (overallSeen.has(k) || gear.has(k)) continue;
          gear.add(k);
          out.WeaponClasses[side.name][e.class_name][e.slot].push({ NameID: e.name_id, Tier: OUTPUT_TIER });
        }
      }
      out.Vehicles.TeamSpecificLoadout[side.name] = [...vehicles].map(([NameID, LimitPerTeam]) => ({ NameID, Tier: OUTPUT_TIER, LimitPerTeam }));
    }
    return out;
  }

  /** @returns {{valid:boolean, errors:string[]}} */
  validateShape(json) {
    const r = loadoutSchema.safeParse(json);
    if (!r.success) return { valid: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
    const errors = [];
    for (const [team, list] of Object.entries(json.Vehicles.TeamSpecificLoadout)) {
      const ids = list.map((v) => v.NameID);
      if (new Set(ids).size !== ids.length) errors.push(`Vehicles.TeamSpecificLoadout.${team}: duplicate NameID`);
      if (!list.length) errors.push(`Vehicles.TeamSpecificLoadout.${team}: no vehicles`);
    }
    return { valid: errors.length === 0, errors };
  }

  serialize(json) {
    return JSON.stringify(json, null, 2);
  }
}

module.exports = { MTCService, loadoutSchema };
