/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
/*
 * Central permission table. Every slash command is addressed as "<command>.<subcommand>"
 * or "<command>.<group>.<subcommand>". Anything NOT listed here defaults to ADMIN (secure by default).
 */
'use strict';

const LEVELS = Object.freeze({ PUBLIC: 0, REFEREE: 1, ADMIN: 2 });

const ACTIONS = Object.freeze({
  'match.create': 'REFEREE',
  'match.panel': 'REFEREE',
  'match.view': 'REFEREE',
  'match.list': 'REFEREE',
  'match.history': 'REFEREE',
  'match.edit': 'REFEREE',
  'match.finalize': 'REFEREE',
  'match.start': 'REFEREE',
  'match.finish': 'REFEREE',
  'match.cancel': 'REFEREE',
  'match.rounds': 'REFEREE',
  'match.schedule': 'REFEREE',
  'match.referee': 'REFEREE',
  'match.export': 'REFEREE',
  'match.reopen': 'ADMIN',

  'school.list': 'PUBLIC',
  'school.view': 'PUBLIC_LOADOUT',
  'school.tanks': 'PUBLIC_LOADOUT',
  'school.add': 'ADMIN',
  'school.edit': 'ADMIN',
  'school.remove': 'ADMIN',
  'school.import': 'ADMIN',
  'school.export': 'ADMIN',
  'school.loadout.view': 'REFEREE',
  'school.loadout.add-tank': 'ADMIN',
  'school.loadout.remove-tank': 'ADMIN',
  'school.loadout.set-quantity': 'ADMIN',
  'school.loadout.add-equipment': 'ADMIN',
  'school.loadout.remove-equipment': 'ADMIN',
  'school.loadout.add-camo': 'ADMIN',
  'school.loadout.remove-camo': 'ADMIN',
  'school.loadout.set-requirement': 'ADMIN',

  'tank.list': 'PUBLIC',
  'tank.search': 'PUBLIC',
  'tank.info': 'PUBLIC',
  'tank.add': 'ADMIN',
  'tank.remove': 'ADMIN',
  'tank.edit': 'ADMIN',
  'tank.enable': 'ADMIN',
  'tank.disable': 'ADMIN',

  'admin.panel': 'ADMIN',
  'admin.validate-database': 'ADMIN',
  'admin.config': 'ADMIN',
  'admin.backup': 'ADMIN',
  'admin.audit': 'ADMIN',
  'admin.equipment.add': 'ADMIN',
  'admin.equipment.edit': 'ADMIN',
  'admin.equipment.remove': 'ADMIN',
  'admin.equipment.base': 'ADMIN',
});

module.exports = { LEVELS, ACTIONS };
