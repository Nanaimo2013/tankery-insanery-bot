'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');
const { runConsoleCommand } = require('../src/console');

test('maintenance mode is off by default, switched from the console, stored and announced', () => {
  const { s } = setup();
  assert.equal(s.maintenance.isEnabled(), false);
  const seen = [];
  s.maintenance.on('change', (st) => seen.push(st.enabled));
  assert.match(runConsoleCommand('maintenance on Updating loadouts', s), /ON - Updating loadouts/);
  assert.equal(s.maintenance.isEnabled(), true);
  assert.equal(s.maintenance.status().reason, 'Updating loadouts');
  assert.match(runConsoleCommand('maintenance status', s), /ON since/);
  assert.match(runConsoleCommand('maintenance off', s), /OFF/);
  assert.equal(s.maintenance.isEnabled(), false);
  assert.deepEqual(seen, [true, false]);
  assert.match(runConsoleCommand('nonsense', s), /Unknown command/);
  assert.equal(runConsoleCommand('   ', s), null);
});

test('maintenance survives a restart and syncs from another process', () => {
  const { s } = setup();
  s.maintenance.enable('x');
  const { MaintenanceService } = require('../src/services/MaintenanceService');
  const again = new MaintenanceService(s.db);
  assert.equal(again.isEnabled(), true);
  s.db.prepare("UPDATE bot_config SET value = ? WHERE key = 'maintenance'").run(JSON.stringify({ enabled: false }));
  let fired = 0; again.on('change', () => (fired += 1));
  again.sync();
  assert.equal(again.isEnabled(), false);
  assert.equal(fired, 1);
});
