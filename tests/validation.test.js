'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { setup, env } = require('./helpers');
const { ValidationService } = require('../src/services/ValidationService');
const { loadConfig } = require('../config/config');
const { openDatabase } = require('../src/database/database');
const { createServices } = require('../src/services');
const { seedDatabase } = require('../src/database/seed');

test('clean database validates with zero errors', () => {
  const { s } = setup();
  const r = s.validation.run();
  assert.equal(r.ok, true);
  assert.match(ValidationService.render(r), /✅ Errors: 0/);
});

test('detects modern vehicles, bad quantities, missing NameIDs, duplicate schools', () => {
  const { s, schools } = setup();
  s.db.prepare("INSERT INTO tanks (name, display_name, name_id, era, is_modern) VALUES ('m1','M1 Abrams','M1 Abrams','MODERN',1)").run();
  s.db.prepare("INSERT INTO tanks (name, display_name, name_id, era, is_ww2) VALUES ('x','No NameID','','WWII',1)").run();
  s.db.prepare("INSERT INTO schools (name) VALUES ('BC-Freedom High School')").run();
  const e = s.validation.run().errors.join('\n');
  assert.match(e, /enabled Modern vehicle/);
  assert.match(e, /no MTC NameID/);
  assert.match(e, /Possible duplicate school/);
  assert.equal(s.validation.run().ok, false);
  void schools;
});

test('starter data seeds cleanly, is idempotent and keeps unusual names', () => {
  const config = loadConfig(env());
  const s = createServices(config, { db: openDatabase(':memory:') });
  const first = seedDatabase(s);
  assert.equal(first.schools.schools, 19);
  assert.equal(first.tanks.created, 94); // 88 MTC vehicles + 6 school-document vehicles with no MTC equivalent
  const second = seedDatabase(s);
  assert.equal(second.tanks.created, 0);
  assert.equal(s.schools.count(), 19);
  const chi = s.loadouts.getLoadout(s.schools.find('Chi-Ha-Tan Academy').id);
  assert.ok(chi.tanks.some((t) => t.display_name === 'T-34-85' && t.quantity === 1));
  assert.ok(chi.tanks.some((t) => t.display_name === 'LVT-6 Gator'));
  const koala = s.loadouts.getLoadout(s.schools.find('Koala Forest Academy').id);
  assert.equal(koala.tanks.find((t) => t.display_name === 'Comet Mk.1').quantity, 4);
  assert.deepEqual(koala.camos, ['Gray']);
  assert.ok(s.validation.run().ok);
  assert.ok(path); // keep linter quiet
});

test('config validation rejects missing/invalid environment', () => {
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
  assert.throws(() => loadConfig(env({ GUILD_ID: 'abc' })), /GUILD_ID/);
  assert.throws(() => loadConfig(env({ MAX_MATCH_TEAMS: '99' })), /MAX_MATCH_TEAMS/);
  const c = loadConfig(env({ BACKUP_INTERVAL_HOURS: '6' }));
  assert.equal(c.backups.intervalHours, 6);
  assert.equal(c.matches.maxTeams, 10);
  assert.doesNotThrow(() => loadConfig({}, { discord: false }));
});
