'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('LoadoutService: quantities are stored as integers; add / set / remove', () => {
  const { s, schools, tanks } = setup();
  const r = s.loadouts.addTank(schools.kuro.id, tanks.pershing.id, 5, null);
  assert.deepEqual([r.previous, r.current], [0, 5]);
  assert.equal(s.loadouts.setQuantity(schools.kuro.id, tanks.pershing.id, 3, null).current, 3);
  assert.equal(s.loadouts.removeTank(schools.kuro.id, tanks.pershing.id, 1, null).current, 2);
  assert.equal(s.loadouts.removeTank(schools.kuro.id, tanks.pershing.id, null, null).current, 0);
  assert.equal(s.loadouts.getEntry(schools.kuro.id, tanks.pershing.id), undefined);
  assert.throws(() => s.loadouts.addTank(schools.kuro.id, tanks.pershing.id, 0, null), /whole number/);
  assert.throws(() => s.loadouts.addTank(schools.kuro.id, tanks.pershing.id, 1.5, null), /whole number/);
});

test('LoadoutService: equipment and camo', () => {
  const { s, schools } = setup();
  const eq = s.equipment.add({ name: 'Fire Extinguisher', name_id: 'Fire Extinguisher', class_name: 'Crewman', slot: 'PassiveTools' }, null);
  s.loadouts.addEquipment(schools.bc.id, eq.id, null);
  assert.throws(() => s.loadouts.addEquipment(schools.bc.id, eq.id, null), /already has/);
  s.loadouts.addCamo(schools.bc.id, 'Panzer Gelb', null);
  assert.deepEqual(s.loadouts.getLoadout(schools.bc.id).camos, ['Panzer Gelb']);
  s.loadouts.removeCamo(schools.bc.id, 'panzer gelb', null);
  assert.equal(s.loadouts.getLoadout(schools.bc.id).camos.length, 0);
  s.loadouts.removeEquipment(schools.bc.id, eq.id, null);
});

test('LoadoutService: import keeps unusual names, flags unknown quantities, is atomic', () => {
  const { s } = setup();
  const sum = s.loadouts.importData({ schools: [{ name: 'Chi-Ha-Tan Academy', camo: ['Sand'], special_requirements: ['ReQ. 250 points for addon armour.'], tanks: [{ name: 'T-34 (85)', quantity: null }, { name: 'KV-5', quantity: 2 }], equipment: ['Binoculars'] }] }, { actor: null });
  assert.equal(sum.quantityReview, 1);
  const school = s.schools.find('Chi-Ha-Tan Academy');
  const l = s.loadouts.getLoadout(school.id);
  const t34 = l.tanks.find((t) => t.display_name === 'T-34 (85)');
  assert.equal(t34.quantity_needs_review, true);
  assert.equal(t34.quantity, 0);
  assert.deepEqual(l.special_requirements, ['ReQ. 250 points for addon armour.']);
  // unverified quantities are not selectable in matches
  assert.ok(!s.loadouts.availableForMatch(school.id).some((t) => t.display_name === 'T-34 (85)'));
  // atomic: a bad record rolls back the whole file
  const count = s.schools.count();
  assert.throws(() => s.loadouts.importData({ schools: [{ name: 'Good School', tanks: [] }, { name: '', tanks: [] }] }, {}));
  assert.equal(s.schools.count(), count);
});

test('LoadoutService: raw export round-trips through import', () => {
  const { s, schools } = setup();
  const raw = s.loadouts.exportRaw(schools.bc.id);
  const again = s.loadouts.importData(raw, { replace: true, actor: null });
  assert.equal(again.entries, 2);
  assert.equal(s.loadouts.getEntry(schools.bc.id, s.tanks.find('M26 Pershing').id).quantity, 5);
});
