/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

require('dotenv').config();
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');

const config = loadConfig(process.env, { discord: false });
const services = createServices(config);
services.backups
  .run()
  .then((f) => console.log(`Backup written: ${f}`))
  .catch((e) => {
    console.error('Backup failed:', e.message);
    process.exitCode = 1;
  })
  .finally(() => services.db.close());
