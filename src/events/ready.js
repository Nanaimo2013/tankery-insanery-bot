/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { Events, ActivityType } = require('discord.js');
const { getLogger } = require('../utils/logger');

/** Online + "watching tank matches" normally; Do Not Disturb + a maintenance status while the bot is down. */
function applyPresence(client, state) {
  if (!client.user) return;
  if (state.enabled) client.user.setPresence({ status: 'dnd', activities: [{ name: '🛠️ Down for maintenance', type: ActivityType.Custom }] });
  else client.user.setPresence({ status: 'online', activities: [{ name: 'tank matches ⚔️', type: ActivityType.Watching }] });
}

module.exports = {
  applyPresence,
  name: Events.ClientReady,
  once: true,
  async execute(ctx, client) {
    getLogger().info({ tag: client.user.tag, guilds: client.guilds.cache.size }, `${ctx.config.bot.name} v${ctx.config.bot.version} is online`);
    applyPresence(client, ctx.services.maintenance.status());
    ctx.services.maintenance.on('change', (state) => applyPresence(client, state));
    ctx.services.backups.start();
    if (!client.guilds.cache.has(ctx.config.discord.guildId)) {
      getLogger().warn('The bot is not a member of GUILD_ID - invite it, then run `npm run deploy`.');
    }
  },
};
