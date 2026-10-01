/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// Registers slash commands for the configured guild (instant). Usage: npm run deploy [-- --clear]
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { getConfig } = require('../config/config');
const { loadCommands } = require('../src/commands');

const config = getConfig();
const rest = new REST({ version: '10' }).setToken(config.discord.token);
const body = process.argv.includes('--clear') ? [] : [...loadCommands().values()].map((c) => c.data.toJSON());

(async () => {
  const res = await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
  console.log(`✅ Registered ${res.length} command(s) in guild ${config.discord.guildId}: ${res.map((c) => `/${c.name}`).join(' ')}`);
})().catch((err) => {
  console.error('❌ Command registration failed:', err.message ?? err);
  process.exit(1);
});
