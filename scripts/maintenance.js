/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// Usage: npm run maintenance -- on "Updating the loadouts"   |   npm run maintenance -- off   |   npm run maintenance -- status
// Works while the bot is running (it re-reads the flag every few seconds) or while it is stopped.
require('dotenv').config();
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { runConsoleCommand } = require('../src/console');

const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
const out = runConsoleCommand(['maintenance', ...process.argv.slice(2)].join(' '), services);
console.log(out);
services.db.close();
