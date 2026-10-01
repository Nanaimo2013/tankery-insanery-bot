/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// Usage: npm run reseed
// Rebuilds the database from data/seed (the Japan Senshadou League schools + MTC vehicles/equipment).
// The existing database file is copied to ./backups first, then replaced. STOP THE BOT BEFORE RUNNING THIS.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { seedDatabase } = require('../src/database/seed');
const { ValidationService } = require('../src/services/ValidationService');
const { fileStamp } = require('../src/utils/formatters');

const config = loadConfig(process.env, { discord: false });
const file = config.databasePath;

if (file !== ':memory:' && fs.existsSync(file)) {
  fs.mkdirSync(config.backups.dir, { recursive: true });
  const dest = path.join(config.backups.dir, `pre-reseed-${fileStamp()}.sqlite`);
  fs.copyFileSync(file, dest);
  console.log(`Old database copied to ${dest}`);
  for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true });
}

const services = createServices(config);
const r = seedDatabase(services);
console.log('Vehicles  :', r.tanks);
console.log('Equipment :', r.equipment);
console.log('Schools   :', r.schools);
console.log('\n' + ValidationService.render(services.validation.run()));
console.log(`\nDatabase rebuilt: ${file}`);
services.db.close();
