/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';
const { loadConfig } = require('../config/config');
const { openDatabase } = require('../src/database/database');
const { createServices } = require('../src/services');

const ADMIN = '111111111111111111';
const REF = '222222222222222222';
const GUILD = '333333333333333333';

const env = (extra = {}) => ({
  DISCORD_TOKEN: 'x'.repeat(30), CLIENT_ID: '444444444444444444', GUILD_ID: GUILD,
  TI_ADMIN_ROLE_ID: ADMIN, TI_REFEREE_ROLE_ID: REF, DATABASE_PATH: ':memory:', ...extra,
});

const member = (...roles) => ({ roles: { cache: new Set(roles) } });
const admin = member(ADMIN);
const referee = member(REF);
const nobody = member('999999999999999999');

/** Fresh in-memory services with a small realistic dataset. */
function setup(extraEnv = {}) {
  const config = loadConfig(env(extraEnv));
  const s = createServices(config, { db: openDatabase(':memory:') });
  const t = (display_name, name_id, era = 'WWII', extra = {}) => s.tanks.add({ display_name, name_id, era, nation: 'X', vehicle_type: 'Tank', ...extra }, null);
  const tanks = {
    tiger: t('Tiger I', 'Tiger I', 'WWII', { tier: 3 }),
    pershing: t('M26 Pershing', 'M26 Pershing', 'WWII', { tier: 4 }),
    jumbo: t('M4A3E2 76 W VVSS Jumbo Sherman', 'M4A3E2 Sherman', 'WWII', { tier: 3 }),
    t60: t('T-60', 'T-60', 'WWII', { tier: 1 }),
    ft: t('Renault FT', 'Renault FT', 'WWI'),
  };
  const gear = {
    torch: s.equipment.add({ name: 'Repair Torch', name_id: 'Repair Torch', class_name: 'Crewman', slot: 'PassiveTools' }, null),
    binos: s.equipment.add({ name: 'Binoculars', name_id: 'Binoculars', class_name: 'Crewman', slot: 'PassiveTools' }, null),
  };
  const schools = {
    bc: s.schools.add({ name: 'BC Freedom High School', short_name: 'BC Freedom' }, null),
    kuro: s.schools.add({ name: "Kuromorimine Girls' Academy", short_name: 'Kuromorimine' }, null),
    saun: s.schools.add({ name: 'Saunders University High School', short_name: 'Saunders' }, null),
  };
  s.loadouts.addTank(schools.bc.id, tanks.pershing.id, 5, null);
  s.loadouts.addTank(schools.bc.id, tanks.jumbo.id, 1, null);
  s.loadouts.addTank(schools.kuro.id, tanks.tiger.id, 2, null);
  s.loadouts.addTank(schools.saun.id, tanks.pershing.id, 3, null);
  s.loadouts.addTank(schools.saun.id, tanks.t60.id, 2, null);
  s.loadouts.addEquipment(schools.bc.id, gear.torch.id, null);
  s.loadouts.addEquipment(schools.kuro.id, gear.binos.id, null);
  s.loadouts.addEquipment(schools.saun.id, gear.sand.id, null);
  return { config, s, tanks, schools, gear };
}

/** Draft for N Hawk schools vs M Eagle schools. */
function draftFor(s, h, e, hawk, eagle) {
  const d = s.matches.newDraft('555555555555555555', h, e);
  d.hawk = hawk; d.eagle = eagle;
  s.matches.applyTeamEquipmentDefaults(d);
  return d;
}

module.exports = { setup, draftFor, env, member, admin, referee, nobody, ADMIN, REF, GUILD };
