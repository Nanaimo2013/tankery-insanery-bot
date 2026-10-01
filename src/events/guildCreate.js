/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { Events } = require('discord.js');
const { getLogger } = require('../utils/logger');

/** The bot is private to the Tankery Insanery server: leave any other guild it is added to. */
module.exports = {
  name: Events.GuildCreate,
  once: false,
  async execute(ctx, guild) {
    if (guild.id === ctx.config.discord.guildId) return;
    getLogger().warn({ guild: guild.id, name: guild.name }, 'Added to an unauthorised guild - leaving');
    await guild.leave().catch((err) => getLogger().warn({ err }, 'Could not leave guild'));
  },
};
