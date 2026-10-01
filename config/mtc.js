/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SIDES, SIDE_CODES } = require('./matches');

const WEAPON_CLASSES = Object.freeze(['Infantry', 'Crewman', 'Engineer']);
const SLOTS = Object.freeze(['Primary', 'Secondary', 'Tertiary', 'PassiveTools']);
const ALL_ERAS = Object.freeze(['WWI', 'WWII', 'COLD_WAR', 'MODERN']);
/** Eras accepted by default. Administrators can change this with /admin config. */
const DEFAULT_ALLOWED_ERAS = Object.freeze(['WWI', 'WWII']);

/**
 * Every vehicle and tool is written to the match loadout as Tier 1, exactly like the MTC example
 * loadout: tiers are only used by the bot to limit what may be brought (the "tier limit" of a match).
 */
const OUTPUT_TIER = 1;

/** Team keys inside the MTC JSON, in the order MTC's own example lists them. */
const MTC_TEAMS = Object.freeze([SIDES.E.name, SIDES.H.name]);

/** Equipment that is ALWAYS present in the "overall" (all teams) section. */
const MANDATORY_EQUIPMENT = Object.freeze([Object.freeze({ NameID: 'RemoveVehicle', class: 'Engineer', slot: 'Primary' })]);

const emptySlots = () => Object.fromEntries(SLOTS.map((s) => [s, []]));
const emptyClasses = () => Object.fromEntries(WEAPON_CLASSES.map((c) => [c, emptySlots()]));

/** A fresh copy of the exact structure MTC expects (empty). */
function emptyLoadout() {
  const weaponClasses = emptyClasses();
  for (const team of MTC_TEAMS) weaponClasses[team] = emptyClasses();
  return { WeaponClasses: weaponClasses, Vehicles: { GeneralLoadout: [], TeamSpecificLoadout: {} } };
}

module.exports = { WEAPON_CLASSES, SLOTS, ALL_ERAS, DEFAULT_ALLOWED_ERAS, OUTPUT_TIER, MTC_TEAMS, MANDATORY_EQUIPMENT, SIDE_CODES, emptyLoadout };
