/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// Usage: npm run import:tanks -- <file.txt|file.json>
// .txt format: display_name|name_id|nation|vehicle_type|era|year|aliases   (see data/seed/tanks.txt)
require('dotenv').config();
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { importTanks, readTankFile } = require('../src/database/seed');

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import:tanks -- <file.txt|file.json>');
  process.exit(1);
}
const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
try {
  const res = importTanks(services, readTankFile(file));
  console.log(`Created ${res.created}, already present ${res.existing}, rejected ${res.rejected.length}.`);
  for (const r of res.rejected) console.log('  ✗', r);
} catch (err) {
  console.error('Import failed:', err.message);
  process.exitCode = 1;
} finally {
  services.db.close();
}
