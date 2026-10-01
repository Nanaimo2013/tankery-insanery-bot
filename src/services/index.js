/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { getConfig } = require('../../config/config');
const { openDatabase } = require('../database/database');
const { PermissionService } = require('./PermissionService');
const { AuditService } = require('./AuditService');
const { SettingsService } = require('./SettingsService');
const { TankService } = require('./TankService');
const { EquipmentService } = require('./EquipmentService');
const { SchoolService } = require('./SchoolService');
const { MTCService } = require('./MTCService');
const { LoadoutService } = require('./LoadoutService');
const { MatchService } = require('./MatchService');
const { BackupService } = require('./BackupService');
const { ValidationService } = require('./ValidationService');
const { MaintenanceService } = require('./MaintenanceService');

/** Wire every service together. Used by the bot, scripts and tests. */
function createServices(config, { db, embeds, getClient } = {}) {
  const database = db ?? openDatabase(config.databasePath);
  const audit = new AuditService(database, { config, embeds, getClient });
  const settings = new SettingsService(database, { audit });
  const permissions = new PermissionService(config);
  const tanks = new TankService(database, { audit, settings });
  const equipment = new EquipmentService(database, { audit });
  const schools = new SchoolService(database, { audit });
  const mtc = new MTCService();
  const loadouts = new LoadoutService(database, { schools, tanks, equipment, mtc, audit, settings });
  const matches = new MatchService(database, { config, schools, tanks, equipment, loadouts, mtc, permissions, settings, audit });
  const backups = new BackupService(database, { config, audit });
  const validation = new ValidationService(database, { settings, mtc, loadouts, schools });
  const maintenance = new MaintenanceService(database, { audit });
  return { config, db: database, audit, settings, permissions, tanks, equipment, schools, mtc, loadouts, matches, backups, validation, maintenance };
}

module.exports = { createServices, getConfig };
