/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// Usage: npm run import:schools -- <file.json> [--replace]
// File format: see data/seed/schools.json  ({ "schools": [ { name, tanks:[{name,quantity}], equipment:[], camo:[] ... } ] })
require('dotenv').config();
const fs = require('node:fs');
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: npm run import:schools -- <file.json> [--replace]');
  process.exit(1);
}
const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
try {
  const summary = services.loadouts.importData(JSON.parse(fs.readFileSync(file, 'utf8')), { replace: args.includes('--replace') });
  console.log('Import complete:', summary);
} catch (err) {
  console.error('Import failed (nothing was changed):', err.message);
  process.exitCode = 1;
} finally {
  services.db.close();
}
