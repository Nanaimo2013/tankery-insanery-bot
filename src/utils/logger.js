/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const pino = require('pino');

let logger = null;
function getLogger() {
  if (!logger) logger = pino({ level: process.env.LOG_LEVEL || 'info', base: undefined, timestamp: pino.stdTimeFunctions.isoTime });
  return logger;
}

module.exports = { getLogger };
