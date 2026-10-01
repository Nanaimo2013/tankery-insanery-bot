'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MTCService } = require('../src/services/MTCService');
const { loadConfig } = require('../config/config');
const { openDatabase } = require('../src/database/database');
const { createServices } = require('../src/services');
const { seedDatabase, BASE_EQUIPMENT } = require('../src/database/seed');
const { env } = require('./helpers');

const mtc = new MTCService();
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/mtc-example-match.json'), 'utf8').trim();
const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/seed/mtc-ww2-loadout.json'), 'utf8'));

const seeded = () => {
  const s = createServices(loadConfig(env()), { db: openDatabase(':memory:') });
  seedDatabase(s);
  return s;
};

test('empty loadout has the exact MTC structure (Eagle Federation + Hawk Republic sections)', () => {
  const j = mtc.buildLoadout({ teams: [] });
  assert.deepEqual(Object.keys(j), ['WeaponClasses', 'Vehicles']);
  assert.deepEqual(Object.keys(j.WeaponClasses), ['Infantry', 'Crewman', 'Engineer', 'Eagle Federation', 'Hawk Republic']);
  for (const c of ['Infantry', 'Crewman', 'Engineer']) assert.deepEqual(Object.keys(j.WeaponClasses[c]), ['Primary', 'Secondary', 'Tertiary', 'PassiveTools']);
  for (const t of ['Eagle Federation', 'Hawk Republic']) assert.deepEqual(Object.keys(j.WeaponClasses[t]), ['Infantry', 'Crewman', 'Engineer']);
  assert.deepEqual(j.Vehicles, { GeneralLoadout: [], TeamSpecificLoadout: {} });
  assert.equal(mtc.validateShape(j).valid, true);
});

test('output is byte-for-byte the MTC example loadout', () => {
  const tools = ['Repair Torch', 'SprayCan', 'Binoculars', 'Fire Extinguisher', 'AmmoCrate', 'Jerrycan', 'Camo Net', 'Small Camo Net', 'Engineering Tool'];
  const overall = tools.map((name_id) => ({ name_id, class_name: 'Crewman', slot: 'PassiveTools' }));
  const eagle = [['KV-5', 1], ['T-34-85', 1], ['Tiger I', 1], ['L3/35', 1], ['LVT-6 Gator', 1], ['T-34-57', 2], ['M4A2E8 Sherman', 1]];
  const hawk = [['Pz IV H', 1], ['Pz.III M', 1], ['T-34', 1], ['BT-5', 3], ['M18 Hellcat', 1], ['JgPz 38t', 1], ['Stug III G', 1], ['Comet Mk.1', 1], ['M10 Wolverine', 1], ['VK 16.02', 1]];
  const v = (l) => l.map(([name_id, quantity]) => ({ name_id, quantity }));
  const j = mtc.buildLoadout({ overall, teams: [{ side: 'H', vehicles: v(hawk), equipment: [] }, { side: 'E', vehicles: v(eagle), equipment: [] }] });
  assert.equal(JSON.stringify(j), fixture); // compact JSON, same key order
  assert.deepEqual(JSON.parse(mtc.serialize(j)), JSON.parse(fixture));
});

test('overall equipment: RemoveVehicle is always there, extras de-duplicate', () => {
  const j = mtc.buildLoadout({ teams: [], overall: [{ name_id: 'Binoculars', class_name: 'Crewman', slot: 'PassiveTools' }, { name_id: 'Binoculars', class_name: 'Crewman', slot: 'PassiveTools' }, { name_id: 'RemoveVehicle', class_name: 'Engineer', slot: 'Primary' }] });
  assert.deepEqual(j.WeaponClasses.Engineer.Primary, [{ NameID: 'RemoveVehicle', Tier: 1 }]);
  assert.deepEqual(j.WeaponClasses.Crewman.PassiveTools, [{ NameID: 'Binoculars', Tier: 1 }]);
});

test('every output Tier is 1 (the real MTC tiers only drive the tier limit)', () => {
  const s = seeded();
  const t = s.tanks.find('Tiger II');
  assert.equal(t.tier, 5);
  const school = s.schools.find('Kuromorimine');
  const j = s.loadouts.exportMtc(school.id, 'H');
  for (const v of j.Vehicles.TeamSpecificLoadout['Hawk Republic']) assert.equal(v.Tier, 1);
  assert.ok(j.Vehicles.TeamSpecificLoadout['Hawk Republic'].some((v) => v.NameID === 'Tiger II'));
});

test('every vehicle tier in the catalogue equals the MTC WW2 loadout tier', () => {
  const s = seeded();
  const want = new Map();
  for (const list of Object.values(catalogue.Vehicles.TeamSpecificLoadout)) for (const v of list) want.set(v.NameID, v.Tier);
  for (const [nameId, tier] of want) assert.equal(s.tanks.findExact(nameId)?.tier, tier, nameId);
});

test('every vehicle a school can bring maps to a real MTC NameID', () => {
  const s = seeded();
  const valid = new Set();
  for (const list of Object.values(catalogue.Vehicles.TeamSpecificLoadout)) for (const v of list) valid.add(v.NameID);
  for (const school of s.schools.list()) {
    for (const t of s.loadouts.availableForMatch(school.id)) assert.ok(valid.has(t.name_id), `${school.name}: ${t.name_id} is not an MTC vehicle`);
  }
});

test('full match built from the seed: right school, right team, tier limit respected', () => {
  const s = seeded();
  const kuro = s.schools.find('Kuromorimine');
  const saun = s.schools.find('Saunders');
  const d = s.matches.newDraft('555555555555555555', 1, 1);
  d.hawk = [kuro.id]; d.eagle = [saun.id]; d.fullLoadout = true; d.tierCap = 2;
  s.matches.applyFullLoadout(d); s.matches.applyTeamEquipmentDefaults(d);
  assert.deepEqual(s.matches.validate(d).errors, []);
  const j = s.matches.buildLoadout(d);
  assert.deepEqual(Object.keys(j.Vehicles.TeamSpecificLoadout), ['Eagle Federation', 'Hawk Republic']);
  const hawk = j.Vehicles.TeamSpecificLoadout['Hawk Republic'].map((v) => v.NameID);
  const eagle = j.Vehicles.TeamSpecificLoadout['Eagle Federation'].map((v) => v.NameID);
  assert.deepEqual(hawk.sort(), ['PaKWagen', 'Pz IV H', 'Pz.III M', 'Sd Kfz 251', 'T-60', 'VK 16.02']);
  assert.ok(eagle.includes('M4A1 Sherman') && eagle.includes('M4A2 Sherman'));
  assert.ok(!eagle.includes('M26 T99')); // tier 4 - over the limit
  assert.ok(!hawk.some((n) => eagle.includes(n) && n !== 'Pz IV H')); // no leakage between teams
  // overall basics + RemoveVehicle
  assert.deepEqual(j.WeaponClasses.Engineer.Primary, [{ NameID: 'RemoveVehicle', Tier: 1 }]);
  assert.deepEqual(j.WeaponClasses.Crewman.PassiveTools.map((e) => e.NameID), BASE_EQUIPMENT);
  assert.equal(mtc.validateShape(j).valid, true);
  assert.ok(!JSON.stringify(j).includes('Academy') && !JSON.stringify(j).includes('University'));
});

test('validateShape rejects malformed loadouts and unknown team keys', () => {
  const j = mtc.buildLoadout({ teams: [] });
  delete j.WeaponClasses.Crewman.Primary;
  assert.equal(mtc.validateShape(j).valid, false);
  assert.equal(mtc.validateShape({ Vehicles: {} }).valid, false);
  const k = mtc.buildLoadout({ teams: [] });
  k.Vehicles.TeamSpecificLoadout['Some School'] = [];
  assert.equal(mtc.validateShape(k).valid, false);
});
