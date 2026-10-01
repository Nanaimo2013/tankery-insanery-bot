/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { eph, reply } = require('../../ui/common');
const help = require('../../ui/help');

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('How to use Tankery Insanery - guides, commands and tips')
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName('topic')
      .setDescription('Jump straight to a help page')
      .addChoices(...help.PAGES.map((p) => ({ name: `${p.emoji} ${p.label}`, value: p.id }))),
  );

async function execute(ctx, i) {
  return reply(i, eph(help.render(ctx, i.member, i.options.getString('topic') ?? 'home')));
}

module.exports = { data, execute };
