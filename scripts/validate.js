/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

require('dotenv').config();
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { ValidationService } = require('../src/services/ValidationService');

const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
const r = services.validation.run();
console.log(ValidationService.render(r));
for (const e of r.errors) console.log('  ❌', e);
for (const w of r.warnings.slice(0, 50)) console.log('  ⚠️', w);
services.db.close();
process.exitCode = r.ok ? 0 : 1;
