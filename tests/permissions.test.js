'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, admin, referee, nobody, GUILD } = require('./helpers');

test('admin can do everything admin-level; referees and public cannot', () => {
  const { s } = setup();
  for (const a of ['school.add', 'tank.remove', 'school.loadout.add-tank', 'school.loadout.set-quantity', 'admin.panel', 'admin.config', 'school.import', 'admin.equipment.base', 'match.reopen']) {
    assert.equal(s.permissions.can(admin, a), true, a);
    assert.equal(s.permissions.can(referee, a), false, `${a} must be denied to referee`);
    assert.equal(s.permissions.can(nobody, a), false, `${a} must be denied to public`);
  }
});

test('referee can create/view/export matches and view loadouts', () => {
  const { s } = setup();
  for (const a of ['match.create', 'match.finalize', 'match.export', 'match.rounds', 'match.schedule', 'match.referee', 'match.start', 'match.finish', 'school.loadout.view', 'match.panel', 'school.view', 'tank.search']) {
    assert.equal(s.permissions.can(referee, a), true, a);
  }
  assert.equal(s.permissions.can(nobody, 'match.create'), false);
  assert.equal(s.permissions.can(nobody, 'tank.search'), true);
});

test('unknown actions default to ADMIN (secure by default)', () => {
  const { s } = setup();
  assert.equal(s.permissions.can(referee, 'something.new'), false);
  assert.equal(s.permissions.can(admin, 'something.new'), true);
});

test('ALLOW_PUBLIC_LOADOUT_VIEW=false hides school loadouts from the public', () => {
  const { s } = setup({ ALLOW_PUBLIC_LOADOUT_VIEW: 'false' });
  assert.equal(s.permissions.can(nobody, 'school.view'), false);
  assert.equal(s.permissions.can(referee, 'school.view'), true);
});

test('referees can only manage their own matches; admins any', () => {
  const { s } = setup();
  const mine = { referee_id: 'u1' };
  assert.equal(s.permissions.canManageMatch(referee, 'u1', mine), true);
  assert.equal(s.permissions.canManageMatch(referee, 'u2', mine), false);
  assert.equal(s.permissions.canManageMatch(admin, 'u2', mine), true);
  assert.equal(s.permissions.canManageMatch(nobody, 'u1', mine), false);
});

test('ALLOW_REFEREE_EXPORT=false stops referee exports', () => {
  const { s } = setup({ ALLOW_REFEREE_EXPORT: 'false' });
  assert.equal(s.permissions.canExportMatch(referee), false);
  assert.equal(s.permissions.canExportMatch(admin), true);
});

test('guild check', () => {
  const { s } = setup();
  assert.equal(s.permissions.isCorrectGuild(GUILD), true);
  assert.equal(s.permissions.isCorrectGuild('1'), false);
  assert.equal(s.permissions.isCorrectGuild(null), false);
});

test('raw API member shape (roles array) works too', () => {
  const { s } = setup();
  assert.equal(s.permissions.isAdmin({ roles: ['111111111111111111'] }), true);
});
