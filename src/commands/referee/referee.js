/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { eph, reply } = require('../../ui/common');
const panels = require('../../ui/panels');

const data = new SlashCommandBuilder()
  .setName('referee')
  .setDescription('TI Referee tools')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('panel').setDescription('Open the referee panel'));

async function execute(ctx, i) {
  return reply(i, eph(panels.refereePanel(ctx)));
}

module.exports = { data, execute };
