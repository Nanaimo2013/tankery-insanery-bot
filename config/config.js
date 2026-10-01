/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const path = require('node:path');
const { z } = require('zod');

const ROOT = path.resolve(__dirname, '..');

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)');
const optSnowflake = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), snowflake.optional());
const bool = (def) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true'), z.boolean());
const int = (def, min, max) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : Number(v)), z.number().int().min(min).max(max));
const str = (def) => z.preprocess((v) => (v === undefined || v === '' ? def : v), z.string());
const color = (def) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : v), z.string().regex(/^#?[0-9a-fA-F]{6}$/, 'must be a hex colour'));

const baseShape = {
  DATABASE_PATH: str('./data/tankery.sqlite'),
  LOG_LEVEL: z.preprocess(
    (v) => (v === undefined || v === '' ? 'info' : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  ),
  BOT_NAME: str('Tankery Insanery - MTC Match Manager'),
  BOT_VERSION: str('1.1.2'),
  BACKUP_DIR: str('./backups'),
  ENABLE_DATABASE_BACKUPS: bool(true),
  BACKUP_INTERVAL_HOURS: int(24, 1, 24 * 30),
  BACKUP_KEEP: int(14, 1, 1000),
  MAX_MATCH_TEAMS: int(10, 1, 25),
  MAX_SCHOOLS_PER_MATCH: int(20, 2, 50),
  ALLOW_DUPLICATE_SCHOOLS: bool(false),
  ALLOW_PUBLIC_LOADOUT_VIEW: bool(true),
  ALLOW_REFEREE_EXPORT: bool(true),
  ADMIN_IMPLIES_REFEREE: bool(true),
  EMBED_COLOR_PRIMARY: color('#2F5D3A'),
  EMBED_COLOR_SUCCESS: color('#2ECC71'),
  EMBED_COLOR_ERROR: color('#E74C3C'),
  EMBED_COLOR_WARNING: color('#F1C40F'),
  EMBED_COLOR_INFO: color('#3498DB'),
  EMBED_COLOR_HAWK: color('#EF4444'),
  EMBED_COLOR_EAGLE: color('#3B82F6'),
};

const discordShape = {
  DISCORD_TOKEN: z.string().min(20, 'is required'),
  CLIENT_ID: snowflake,
  GUILD_ID: snowflake,
  TI_ADMIN_ROLE_ID: snowflake,
  TI_REFEREE_ROLE_ID: snowflake,
  MATCH_CHANNEL_ID: optSnowflake,
  LOADOUT_CHANNEL_ID: optSnowflake,
  ADMIN_LOG_CHANNEL_ID: optSnowflake,
};

class ConfigError extends Error {}

/**
 * Validate and build the configuration object.
 * @param {object} env  environment map (defaults to process.env)
 * @param {{discord?: boolean}} opts  discord:false skips Discord-only variables (seed/backup scripts, tests)
 */
function loadConfig(env = process.env, opts = {}) {
  const needDiscord = opts.discord !== false;
  const shape = needDiscord ? { ...baseShape, ...discordShape } : { ...baseShape, ...Object.fromEntries(Object.keys(discordShape).map((k) => [k, z.any().optional()])) };
  const parsed = z.object(shape).safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const v = parsed.data;
  const hex = (c) => parseInt(String(c).replace('#', ''), 16);
  const resolve = (p) => (path.isAbsolute(p) ? p : path.resolve(ROOT, p));
  return Object.freeze({
    root: ROOT,
    discord: { token: v.DISCORD_TOKEN, clientId: v.CLIENT_ID, guildId: v.GUILD_ID },
    roles: { admin: v.TI_ADMIN_ROLE_ID, referee: v.TI_REFEREE_ROLE_ID },
    channels: { match: v.MATCH_CHANNEL_ID, loadout: v.LOADOUT_CHANNEL_ID, adminLog: v.ADMIN_LOG_CHANNEL_ID },
    databasePath: v.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(v.DATABASE_PATH),
    logLevel: v.LOG_LEVEL,
    bot: { name: v.BOT_NAME, version: v.BOT_VERSION, copyright: "© Nan's Studio's" },
    backups: { enabled: v.ENABLE_DATABASE_BACKUPS, dir: resolve(v.BACKUP_DIR), intervalHours: v.BACKUP_INTERVAL_HOURS, keep: v.BACKUP_KEEP },
    matches: { maxTeams: v.MAX_MATCH_TEAMS, maxSchools: v.MAX_SCHOOLS_PER_MATCH, allowDuplicateSchools: v.ALLOW_DUPLICATE_SCHOOLS },
    access: { publicLoadoutView: v.ALLOW_PUBLIC_LOADOUT_VIEW, refereeExport: v.ALLOW_REFEREE_EXPORT, adminImpliesReferee: v.ADMIN_IMPLIES_REFEREE },
    colors: {
      primary: hex(v.EMBED_COLOR_PRIMARY), success: hex(v.EMBED_COLOR_SUCCESS), error: hex(v.EMBED_COLOR_ERROR),
      warning: hex(v.EMBED_COLOR_WARNING), info: hex(v.EMBED_COLOR_INFO), hawk: hex(v.EMBED_COLOR_HAWK), eagle: hex(v.EMBED_COLOR_EAGLE),
    },
  });
}

let cached = null;
/** Load config once; prints a clear error and exits if invalid. */
function getConfig(opts = {}) {
  if (cached) return cached;
  try {
    cached = loadConfig(process.env, opts);
  } catch (err) {
    if (err instanceof ConfigError) {
      // eslint-disable-next-line no-console
      console.error(`\n❌ ${err.message}\n\nCopy .env.example to .env and fill in the missing values.\n`);
      process.exit(1);
    }
    throw err;
  }
  return cached;
}

module.exports = { loadConfig, getConfig, ConfigError, ROOT };
