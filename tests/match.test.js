'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, draftFor, admin, referee, nobody } = require('./helpers');

function pick(d, key, tank, qty) { (d.vehicles[key] ??= {})[tank.id] = qty; }
const me = (d) => ({ id: d.refereeId, member: referee });

test('school counts: 1v1, 2v2, 5v5, uneven and custom sizes are valid', () => {
  const { s } = setup();
  for (const [a, b] of [[1, 1], [2, 2], [5, 5], [1, 2], [2, 3], [3, 5], [10, 10]]) assert.doesNotThrow(() => s.matches.validateTeamCounts(a, b), `${a}v${b}`);
  assert.throws(() => s.matches.validateTeamCounts(0, 1), /between 1 and 10/);
  assert.throws(() => s.matches.validateTeamCounts(11, 1), /between 1 and 10/);
});

test('MAX_MATCH_TEAMS and MAX_SCHOOLS_PER_MATCH are configurable', () => {
  const { s } = setup({ MAX_MATCH_TEAMS: '3', MAX_SCHOOLS_PER_MATCH: '4' });
  assert.throws(() => s.matches.validateTeamCounts(4, 1), /between 1 and 3/);
  assert.throws(() => s.matches.validateTeamCounts(3, 3), /at most 4/);
});

test('finalize freezes MTC JSON: Hawk Republic / Eagle Federation keys, each team only gets its own school', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 3); pick(d, 'E0', tanks.tiger, 2);
  const saved = s.matches.save(d, {});
  assert.equal(s.matches.finalize(saved.id, me(d)).status, 'READY');
  const json = JSON.parse(s.matches.exportJson(saved.id));
  assert.deepEqual(json.Vehicles.TeamSpecificLoadout, {
    'Eagle Federation': [{ NameID: 'Tiger I', Tier: 1, LimitPerTeam: 2 }],
    'Hawk Republic': [{ NameID: 'M26 Pershing', Tier: 1, LimitPerTeam: 3 }],
  });
  assert.deepEqual(json.Vehicles.GeneralLoadout, []);
  assert.ok(!JSON.stringify(json).includes('BC Freedom'));
  assert.deepEqual(json.WeaponClasses.Engineer.Primary, [{ NameID: 'RemoveVehicle', Tier: 1 }]);
});

test("the right equipment goes to the right team (and not to the other)", () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]); // bc: Repair Torch, kuro: Binoculars
  d.equipment = []; // no overall basics
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  const j = s.matches.buildLoadout(d);
  assert.deepEqual(j.WeaponClasses['Hawk Republic'].Crewman.PassiveTools, [{ NameID: 'Repair Torch', Tier: 1 }]);
  assert.deepEqual(j.WeaponClasses['Eagle Federation'].Crewman.PassiveTools, [{ NameID: 'Binoculars', Tier: 1 }]);
  assert.deepEqual(j.WeaponClasses.Crewman.PassiveTools, []);
});

test('overall equipment (the basics) go to everyone and are not repeated per team', () => {
  const { s, schools, tanks, gear } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  d.equipment = [gear.torch.id, gear.binos.id];
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  const j = s.matches.buildLoadout(d);
  assert.deepEqual(j.WeaponClasses.Crewman.PassiveTools.map((e) => e.NameID), ['Repair Torch', 'Binoculars']);
  assert.deepEqual(j.WeaponClasses['Hawk Republic'].Crewman.PassiveTools, []); // already covered by overall
  assert.deepEqual(j.WeaponClasses['Eagle Federation'].Crewman.PassiveTools, []);
});

test('2v2 / uneven matches merge schools on the same side into that side\'s team', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 2, 1, [schools.bc.id, schools.saun.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'H1', tanks.pershing, 3); pick(d, 'E0', tanks.tiger, 1);
  assert.deepEqual(s.matches.validate(d).errors, []);
  const json = s.matches.buildLoadout(d);
  assert.deepEqual(Object.keys(json.Vehicles.TeamSpecificLoadout), ['Eagle Federation', 'Hawk Republic']);
  assert.deepEqual(json.Vehicles.TeamSpecificLoadout['Hawk Republic'], [{ NameID: 'M26 Pershing', Tier: 1, LimitPerTeam: 4 }]);
  assert.equal(s.matches.title(d), 'BC Freedom High School + Saunders University High School (Hawk Republic) vs Kuromorimine Girls\' Academy (Eagle Federation)');
});

test('quantity above inventory is rejected with the documented message', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 6); pick(d, 'E0', tanks.tiger, 1);
  assert.match(s.matches.validate(d).errors.join('\n'), /BC Freedom High School only has 5 M26 Pershing vehicles available\.\n\nRequested:\n6\n\nAvailable:\n5/);
  assert.throws(() => s.matches.finalize(s.matches.save(d, {}).id, {}), /only has 5/);
});

test('tier limit: tier 1 only / tier 2 and below / tier 3 and below / none', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.saun.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.t60, 1); pick(d, 'E0', tanks.tiger, 1); // tiger is tier 3
  d.tierCap = 3; assert.deepEqual(s.matches.validate(d).errors, []);
  d.tierCap = 2; assert.match(s.matches.validate(d).errors.join('\n'), /Tiger I is tier 3, above this match's limit of tier 2/);
  d.tierCap = 1; assert.match(s.matches.validate(d).errors.join('\n'), /tier 3/);
  d.tierCap = null; assert.deepEqual(s.matches.validate(d).errors, []);
  d.tierCap = 2; s.matches.pruneToTier(d);
  assert.deepEqual(d.vehicles.E0, {}); assert.deepEqual(Object.keys(d.vehicles.H0), [String(tanks.t60.id)]);
  assert.deepEqual(s.loadouts.availableForMatch(schools.saun.id, { tierCap: 1 }).map((t) => t.name_id), ['T-60']);
});

test('full loadout: each school brings everything it owns within the tier limit', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.saun.id], [schools.kuro.id]);
  d.fullLoadout = true; d.tierCap = null;
  s.matches.applyFullLoadout(d);
  assert.deepEqual(d.vehicles.H0, { [tanks.pershing.id]: 3, [tanks.t60.id]: 2 });
  assert.deepEqual(d.vehicles.E0, { [tanks.tiger.id]: 2 });
  d.tierCap = 3; s.matches.applyFullLoadout(d);
  assert.deepEqual(d.vehicles.H0, { [tanks.t60.id]: 2 });
  assert.deepEqual(s.matches.validate(d).errors, []);
});

test('vehicles without a verified MTC NameID can never be put in a match', () => {
  const { s, schools } = setup();
  const odd = s.tanks.createUnverified('Mark IV', 'Mark IV', null);
  s.loadouts.addTank(schools.kuro.id, odd.id, 1, null);
  assert.ok(!s.loadouts.availableForMatch(schools.kuro.id).some((t) => t.display_name === 'Mark IV'));
  assert.equal(s.loadouts.blockedForMatch(schools.kuro.id)[0].reason, 'no MTC NameID');
  const d = draftFor(s, 1, 1, [schools.saun.id], [schools.kuro.id]);
  d.vehicles.H0 = { [s.tanks.find('M26 Pershing').id]: 1 }; d.vehicles.E0 = { [odd.id]: 1 };
  assert.match(s.matches.validate(d).errors.join('\n'), /no verified MTC NameID/);
});

test('duplicate schools are blocked unless configured', () => {
  const a = setup();
  const d = draftFor(a.s, 1, 1, [a.schools.bc.id], [a.schools.bc.id]);
  pick(d, 'H0', a.tanks.pershing, 1); pick(d, 'E0', a.tanks.pershing, 1);
  assert.match(a.s.matches.validate(d).errors.join('\n'), /selected more than once/);
  const b = setup({ ALLOW_DUPLICATE_SCHOOLS: 'true' });
  const d2 = draftFor(b.s, 1, 1, [b.schools.bc.id], [b.schools.bc.id]);
  pick(d2, 'H0', b.tanks.pershing, 2); pick(d2, 'E0', b.tanks.pershing, 2);
  assert.deepEqual(b.s.matches.validate(d2).errors, []);
  pick(d2, 'E0', b.tanks.pershing, 4);
  assert.match(b.s.matches.validate(d2).errors.join('\n'), /only has 5/);
});

test('invalid / disabled / modern / unknown vehicles are rejected', () => {
  const { s, schools, tanks } = setup();
  s.tanks.setEnabled(tanks.tiger.id, false, null);
  let d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  assert.match(s.matches.validate(d).errors.join('\n'), /disabled/);
  s.db.prepare("INSERT INTO tanks (name, display_name, name_id, era, is_modern) VALUES ('m1','M1 Abrams','M1 Abrams','MODERN',1)").run();
  const modern = s.tanks.find('M1 Abrams');
  s.db.prepare('INSERT INTO school_tanks (school_id, tank_id, quantity) VALUES (?,?,5)').run(schools.kuro.id, modern.id);
  d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', modern, 1);
  assert.match(s.matches.validate(d).errors.join('\n'), /not in the permitted eras/);
  pick(d, 'E0', { id: 99999 }, 1);
  assert.match(s.matches.validate(d).errors.join('\n'), /does not exist/);
});

test('school-count mismatches and missing vehicles are rejected', () => {
  const { s, schools } = setup();
  const d = draftFor(s, 2, 1, [schools.bc.id], [schools.kuro.id]);
  const e = s.matches.validate(d).errors.join('\n');
  assert.match(e, /Hawk Republic is set to 2 school\(s\) but 1/);
  assert.match(e, /has no vehicles selected/);
  assert.match(s.matches.validate(draftFor(s, 1, 1, [], [])).errors.join('\n'), /Hawk Republic has no school/);
});

test('referee permission is enforced when validating / managing', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  assert.match(s.matches.validate(d, { member: nobody }).errors.join('\n'), /TI Referee role/);
  assert.deepEqual(s.matches.validate(d, { member: referee }).errors, []);
  const saved = s.matches.save(d, {});
  const other = { id: 'someone-else', member: referee };
  assert.throws(() => s.matches.finalize(saved.id, other), /only finalize matches you created/);
  assert.throws(() => s.matches.cancel(saved.id, other), /only manage matches you created/);
  assert.equal(s.matches.cancel(saved.id, { id: 'x', member: admin }).status, 'CANCELLED');
});

test('lifecycle: READY is immutable until an admin re-opens it; finish records the winner', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  const ref = me(d);
  const m = s.matches.finalize(s.matches.save(d, {}).id, ref);
  assert.throws(() => s.matches.save({ ...m }, ref), /cannot be edited/);
  assert.throws(() => s.matches.reopen(m.id, ref), /Only a TI Admin/);
  assert.equal(s.matches.reopen(m.id, { id: 'a', member: admin }).status, 'DRAFT');
  assert.equal(s.matches.start(s.matches.finalize(m.id, ref).id, ref).status, 'ACTIVE');
  assert.equal(s.matches.complete(m.id, ref).status, 'COMPLETED');
  assert.throws(() => s.matches.cancel(m.id, ref), /cannot move/);
  assert.equal(s.matches.history().length, 1);
});

test('round wins: Hawk vs Eagle score decides the winning school', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  const ref = me(d);
  const m = s.matches.finalize(s.matches.save(d, {}).id, ref);
  assert.throws(() => s.matches.setRounds(m.id, { hawk: 1 }, ref), /once .* has started/);
  s.matches.start(m.id, ref);
  s.matches.adjustRound(m.id, 'H', 1, ref); s.matches.adjustRound(m.id, 'H', 1, ref); s.matches.adjustRound(m.id, 'E', 1, ref);
  let live = s.matches.load(m.id);
  assert.deepEqual([live.hawkWins, live.eagleWins], [2, 1]);
  assert.match(s.matches.result(live).text, /BC Freedom High School \(Hawk Republic\) leads 2 - 1/);
  s.matches.complete(m.id, ref);
  const done = s.matches.load(m.id);
  assert.equal(done.winner, 'H');
  assert.equal(s.matches.result(done).text, '🏆 BC Freedom High School (Hawk Republic) won 2 - 1');
  // correcting the score afterwards recalculates the winner
  s.matches.setRounds(m.id, { hawk: 1, eagle: 3 }, ref);
  assert.equal(s.matches.load(m.id).winner, 'E');
  assert.match(s.matches.result(s.matches.load(m.id)).text, /Kuromorimine Girls' Academy \(Eagle Federation\) won 1 - 3/);
  s.matches.setRounds(m.id, { hawk: 2, eagle: 2 }, ref);
  assert.equal(s.matches.load(m.id).winner, 'DRAW');
  assert.throws(() => s.matches.setRounds(m.id, { hawk: -1 }, ref), /whole numbers/);
  assert.throws(() => s.matches.setRounds(m.id, { hawk: 100 }, ref), /whole numbers/);
});

test('schedule: stored as a unix time, can be changed and cleared', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  d.scheduledAt = 1792377000; d.timezone = 'America/Vancouver';
  const saved = s.matches.save(d, {});
  assert.equal(s.matches.load(saved.id).scheduledAt, 1792377000);
  s.matches.setSchedule(saved.id, { epoch: 1792380600, zoneLabel: 'UTC' }, me(d));
  assert.equal(s.matches.load(saved.id).scheduledAt, 1792380600);
  s.matches.setSchedule(saved.id, { epoch: null }, me(d));
  assert.equal(s.matches.load(saved.id).scheduledAt, null);
});

test('the referee can be changed; the new referee then manages the match', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  const saved = s.matches.save(d, {});
  const old = me(d);
  assert.throws(() => s.matches.changeReferee(saved.id, 'u2', old, { targetMember: nobody }), /does not have the TI Referee role/);
  assert.throws(() => s.matches.changeReferee(saved.id, d.refereeId, old, { targetMember: referee }), /already the referee/);
  assert.equal(s.matches.changeReferee(saved.id, 'u2', old, { targetMember: referee }).refereeId, 'u2');
  assert.throws(() => s.matches.finalize(saved.id, old), /only finalize matches you created/);
  assert.equal(s.matches.finalize(saved.id, { id: 'u2', member: referee }).status, 'READY');
  s.matches.cancel(saved.id, { id: 'u2', member: referee });
  assert.throws(() => s.matches.changeReferee(saved.id, 'u3', { id: 'a', member: admin }, { targetMember: referee }), /can no longer be changed/);
});

test('inventory is not consumed by matches (permanent loadouts untouched)', () => {
  const { s, schools, tanks } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 5); pick(d, 'E0', tanks.tiger, 2);
  s.matches.finalize(s.matches.save(d, {}).id, me(d));
  assert.equal(s.loadouts.getEntry(schools.bc.id, tanks.pershing.id).quantity, 5);
});

test('a saved match round-trips tiers, full-loadout flag, equipment scopes', () => {
  const { s, schools, tanks, gear } = setup();
  const d = draftFor(s, 1, 1, [schools.bc.id], [schools.kuro.id]);
  pick(d, 'H0', tanks.pershing, 1); pick(d, 'E0', tanks.tiger, 1);
  d.tierCap = 4; d.fullLoadout = false; d.equipment = [gear.binos.id];
  const back = s.matches.load(s.matches.save(d, {}).id);
  assert.equal(back.tierCap, 4);
  assert.deepEqual(back.equipment, [gear.binos.id]);
  assert.deepEqual(back.teamEquipment.H0, [gear.torch.id]);
  assert.deepEqual(back.teamEquipment.E0, [gear.binos.id]);
});
