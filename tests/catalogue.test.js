'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { ValidationError } = require('../src/utils/validators');

test('TankService: search finds tiger / sherman / t-34 style queries', () => {
  const { s } = setup();
  s.tanks.add({ display_name: 'T-34-85', name_id: 'T-34-85', era: 'WWII', nation: 'Soviet Union' }, null);
  assert.ok(s.tanks.search('tiger').some((t) => t.display_name === 'Tiger I'));
  assert.ok(s.tanks.search('sherman').some((t) => t.name_id === 'M4A3E2 Sherman'));
  assert.equal(s.tanks.search('t-34')[0].display_name, 'T-34-85');
  assert.deepEqual(s.tanks.search('zzzz'), []);
});

test('TankService: Cold War / Modern vehicles are rejected by default', () => {
  const { s } = setup();
  assert.throws(() => s.tanks.add({ display_name: 'Leopard 2', name_id: 'Leopard 2', era: 'MODERN' }, null), ValidationError);
  assert.throws(() => s.tanks.add({ display_name: 'T-55', name_id: 'T-55', era: 'COLD_WAR' }, null), /not permitted/);
});

test('TankService: admin can change allowed eras, then the era is accepted', () => {
  const { s } = setup();
  s.settings.set('allowed_eras', 'WWI,WWII,COLD_WAR', null);
  const t = s.tanks.add({ display_name: 'T-55', name_id: 'T-55', era: 'COLD_WAR' }, null);
  assert.equal(t.is_cold_war, 1);
});

test('TankService: duplicate names and NameID vs display name stay separate', () => {
  const { s, tanks } = setup();
  assert.throws(() => s.tanks.add({ display_name: 'tiger i', name_id: 'x', era: 'WWII' }, null), /already exists/);
  assert.equal(tanks.jumbo.name_id, 'M4A3E2 Sherman');
  assert.notEqual(tanks.jumbo.display_name, tanks.jumbo.name_id);
});

test('TankService: aliases are searchable, findExact does not fold punctuation', () => {
  const { s } = setup();
  s.tanks.add({ display_name: 'T-34 (85)', name_id: 'T-34-85', era: 'WWII' }, null, { aliases: ['T34/85'] });
  assert.ok(s.tanks.findExact('T-34 (85)'));
  assert.equal(s.tanks.findExact('T-34-85')?.display_name, 'T-34 (85)'); // matches via name_id, not display
  assert.equal(s.tanks.findExact('t3485'), null);
});

test('TankService: cannot delete a vehicle in use; can disable', () => {
  const { s, tanks } = setup();
  assert.throws(() => s.tanks.remove(tanks.pershing.id, null), /used by/);
  assert.equal(s.tanks.setEnabled(tanks.pershing.id, false, null).enabled, false);
});

test('SchoolService: add / duplicate / edit / find / remove', () => {
  const { s, schools } = setup();
  assert.throws(() => s.schools.add({ name: 'bc freedom high school' }, null), /already exists/);
  assert.equal(s.schools.find('BC Freedom').id, schools.bc.id);
  assert.equal(s.schools.update(schools.bc.id, { country: 'France' }, null).country, 'France');
  assert.equal(s.schools.update(schools.bc.id, { enabled: false }, null).enabled, false);
  const extra = s.schools.add({ name: 'Temp School' }, null);
  s.schools.remove(extra.id, null);
  assert.equal(s.schools.get(extra.id), null);
});

test('audit log records admin changes with previous/new quantity', () => {
  const { s, schools, tanks } = setup();
  const before = s.audit.count();
  s.loadouts.addTank(schools.bc.id, tanks.pershing.id, 2, { id: '1', tag: 'admin#1' });
  const e = s.audit.list({ limit: 1 })[0];
  assert.equal(s.audit.count(), before + 1);
  assert.equal(e.action, 'ADD_TANK');
  assert.equal(e.details.previous, 5);
  assert.equal(e.details.current, 7);
  assert.match(require('../src/services/AuditService').AuditService.format(e), /\[LOADOUT CHANGE\]/);
});
