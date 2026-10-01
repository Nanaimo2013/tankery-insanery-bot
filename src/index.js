/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { getConfig } = require('../config/config');
const { getLogger } = require('./utils/logger');
const { createEmbeds } = require('./utils/embeds');
const { createServices } = require('./services');
const { loadCommands } = require('./commands');
const { seedDatabase } = require('./database/seed');
const { startConsole } = require('./console');

async function main() {
  const config = getConfig();
  const log = getLogger();
  const embeds = createEmbeds(config);
  const ctx = { config, embeds, client: null, commands: null, services: null };
  ctx.services = createServices(config, { embeds, getClient: () => ctx.client });
  ctx.commands = loadCommands();

  if (ctx.services.tanks.count() === 0 && ctx.services.schools.count() === 0) {
    log.info('Empty database detected - loading starter data');
    const r = seedDatabase(ctx.services);
    log.info({ vehicles: r.tanks.created, schools: r.schools.schools }, 'Starter data loaded');
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.GuildMember] });
  ctx.client = client;

  for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter((f) => f.endsWith('.js'))) {
    const ev = require(path.join(__dirname, 'events', file));
    const handler = (...args) => Promise.resolve(ev.execute(ctx, ...args)).catch((err) => log.error({ err, event: ev.name }, 'Event handler failed'));
    if (ev.once) client.once(ev.name, handler);
    else client.on(ev.name, handler);
  }
  client.on('error', (err) => log.error({ err }, 'Discord client error'));
  client.on('warn', (m) => log.warn(m));

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info(`${signal} received - shutting down`);
    try {
      ctx.services.backups.stop();
      await client.destroy();
      ctx.services.db.close();
    } catch (err) {
      log.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => log.error({ err }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (err) => log.error({ err }, 'Uncaught exception'));

  await client.login(config.discord.token);

  // Console control (type "maintenance on <reason>" / "maintenance off" / "help") + pick up `npm run maintenance` changes.
  startConsole(ctx.services, log);
  const poll = setInterval(() => ctx.services.maintenance.sync(), 5000);
  poll.unref?.();
  if (ctx.services.maintenance.isEnabled()) log.warn('Maintenance mode is ON (type "maintenance off" in the console to end it).');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  if (err?.name === 'Error' && /older version of Tankery Insanery/.test(err.message)) console.error(`\n❌ ${err.message}\n`);
  else console.error('Fatal startup error:', err);
  process.exit(1);
});
