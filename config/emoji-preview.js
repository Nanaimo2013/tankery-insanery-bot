/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

// npm run emojis:preview            -> posts ONE message listing every emoji next to its school/team name
// so you can check at a glance that each school got the right picture. Posts to LOADOUT_CHANNEL_ID, else MATCH_CHANNEL_ID.
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadConfig } = require('../config/config');
const { createServices } = require('../src/services');
const { withEmoji, teamEmoji } = require('../config/emojis');
const { SIDES } = require('../config/matches');

(async () => {
  const config = loadConfig(process.env);
  const channel = config.channels.loadout || config.channels.match;
  if (!channel) throw new Error('Set LOADOUT_CHANNEL_ID or MATCH_CHANNEL_ID in .env first.');
  const s = createServices(config);
  const lines = [`${teamEmoji('H')} ${SIDES.H.name}`, `${teamEmoji('E')} ${SIDES.E.name}`, '', ...s.schools.list().map((x) => withEmoji(x))];
  s.db.close();
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  await rest.post(Routes.channelMessages(channel), { body: { content: lines.join('\n'), allowed_mentions: { parse: [] } } });
  console.log('Preview posted.');
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
