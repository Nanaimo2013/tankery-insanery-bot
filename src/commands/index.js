/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Load every command module in src/commands/<group>/*.js. */
function loadCommands() {
  const commands = new Map();
  for (const dir of fs.readdirSync(__dirname, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(__dirname, dir.name)).filter((f) => f.endsWith('.js'))) {
      const mod = require(path.join(__dirname, dir.name, file));
      if (!mod?.data || typeof mod.execute !== 'function') continue;
      commands.set(mod.data.name, mod);
    }
  }
  return commands;
}

module.exports = { loadCommands };
