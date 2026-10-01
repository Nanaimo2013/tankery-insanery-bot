/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

require('dotenv').config();
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { seedDatabase } = require('../src/database/seed');
const { ValidationService } = require('../src/services/ValidationService');

const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
const r = seedDatabase(services);
console.log('Vehicles  :', r.tanks);
console.log('Equipment :', r.equipment);
console.log('Schools   :', r.schools);
console.log('\n' + ValidationService.render(services.validation.run()));
console.log(`\nDatabase: ${config.databasePath}`);
services.db.close();
