/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fileStamp } = require('../utils/formatters');
const { getLogger } = require('../utils/logger');

/** Online SQLite backups: backups/tankery-YYYY-MM-DD-HH-mm-ss.sqlite */
class BackupService {
  constructor(db, { config, audit } = {}) {
    this.db = db;
    this.config = config;
    this.audit = audit;
    this.timer = null;
    this.running = false;
  }

  get dir() {
    return this.config.backups.dir;
  }

  async run(actor = null) {
    if (this.config.databasePath === ':memory:') throw new Error('Cannot back up an in-memory database.');
    if (this.running) throw new Error('A backup is already running.');
    this.running = true;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const file = path.join(this.dir, `tankery-${fileStamp()}.sqlite`);
      await this.db.backup(file); // consistent snapshot even while the bot is writing
      this.prune();
      getLogger().info({ file }, 'Database backup created');
      this.audit?.log(actor, { category: 'BACKUP', action: 'CREATE_BACKUP', target: path.basename(file), details: { targetLabel: 'File' } });
      return file;
    } finally {
      this.running = false;
    }
  }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => /^tankery-.*\.sqlite$/.test(f))
      .map((f) => ({ name: f, size: fs.statSync(path.join(this.dir, f)).size, mtime: fs.statSync(path.join(this.dir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
  }

  prune() {
    const files = this.list();
    for (const f of files.slice(this.config.backups.keep)) {
      try {
        fs.unlinkSync(path.join(this.dir, f.name));
      } catch (err) {
        getLogger().warn({ err }, 'Failed to delete old backup');
      }
    }
  }

  start() {
    if (!this.config.backups.enabled || this.timer) return;
    const ms = this.config.backups.intervalHours * 3_600_000;
    this.timer = setInterval(() => this.run().catch((err) => getLogger().error({ err }, 'Scheduled backup failed')), ms);
    this.timer.unref?.();
    getLogger().info({ everyHours: this.config.backups.intervalHours }, 'Automatic backups enabled');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { BackupService };
