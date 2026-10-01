/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { ValidationError } = require('../../utils/validators');
const { ALL_ERAS } = require('../../../config/mtc');
const { eph, reply, auditActor, tankOpt, addTank, autocomplete: auto } = require('../../ui/common');
const lists = require('../../ui/lists');

const eraChoices = ALL_ERAS.map((e) => ({ name: e.replace('_', ' '), value: e }));

const data = new SlashCommandBuilder()
  .setName('tank')
  .setDescription('Browse and manage the MTC vehicle catalogue')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('list').setDescription('Browse all vehicles'))
  .addSubcommand((s) => s.setName('search').setDescription('Search vehicles').addStringOption((o) => o.setName('query').setDescription('e.g. tiger, sherman, t-34').setRequired(true).setMaxLength(60)))
  .addSubcommand((s) => addTank(s.setName('info').setDescription('Vehicle details')))
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a vehicle (TI Admin)')
      .addStringOption((o) => o.setName('display_name').setDescription('Friendly name').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('name_id').setDescription('Exact MTC NameID').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('era').setDescription('Era').setRequired(true).addChoices(...eraChoices))
      .addStringOption((o) => o.setName('nation').setDescription('Nation').setMaxLength(60))
      .addStringOption((o) => o.setName('type').setDescription('Vehicle type').setMaxLength(60))
      .addIntegerOption((o) => o.setName('tier').setDescription('MTC tier').setMinValue(0).setMaxValue(20))
      .addIntegerOption((o) => o.setName('year').setDescription('Year introduced').setMinValue(1900).setMaxValue(2100))
      .addStringOption((o) => o.setName('aliases').setDescription('Alternative names, separated by ;').setMaxLength(300))
      .addStringOption((o) => o.setName('notes').setDescription('Notes').setMaxLength(500)),
  )
  .addSubcommand((s) =>
    addTank(s.setName('edit').setDescription('Edit a vehicle (TI Admin)'))
      .addStringOption((o) => o.setName('display_name').setDescription('New display name').setMaxLength(100))
      .addStringOption((o) => o.setName('name_id').setDescription('Exact MTC NameID (marks the entry verified)').setMaxLength(100))
      .addStringOption((o) => o.setName('era').setDescription('Era').addChoices(...eraChoices))
      .addStringOption((o) => o.setName('nation').setDescription('Nation').setMaxLength(60))
      .addStringOption((o) => o.setName('type').setDescription('Vehicle type').setMaxLength(60))
      .addIntegerOption((o) => o.setName('tier').setDescription('MTC tier').setMinValue(0).setMaxValue(20))
      .addIntegerOption((o) => o.setName('year').setDescription('Year introduced').setMinValue(1900).setMaxValue(2100))
      .addStringOption((o) => o.setName('aliases').setDescription('Replace aliases (separated by ;)').setMaxLength(300))
      .addStringOption((o) => o.setName('notes').setDescription('Notes').setMaxLength(500))
      .addBooleanOption((o) => o.setName('mark_reviewed').setDescription('Clear the "needs review" flag')),
  )
  .addSubcommand((s) => addTank(s.setName('remove').setDescription('Delete a vehicle (TI Admin)')))
  .addSubcommand((s) => addTank(s.setName('enable').setDescription('Enable a vehicle (TI Admin)')))
  .addSubcommand((s) => addTank(s.setName('disable').setDescription('Disable a vehicle (TI Admin)')));

const splitAliases = (v) => v.split(';').map((a) => a.trim()).filter(Boolean);

async function execute(ctx, i) {
  const sub = i.options.getSubcommand();
  const s = ctx.services;
  const actor = auditActor(i);
  switch (sub) {
    case 'list':
      return reply(i, eph(lists.render(ctx, 'tank', 0, '-', i.user)));
    case 'search': {
      const q = i.options.getString('query', true);
      const res = s.tanks.search(q, { limit: 1 });
      if (!res.length) return reply(i, eph({ embeds: [ctx.embeds.warning(`No vehicles matched “${q}”. Try a shorter term, e.g. \`tiger\`.`, '🔎 No results')] }));
      return reply(i, eph(lists.render(ctx, 'tank', 0, q.replace(/[:|]/g, ' ').slice(0, 40), i.user)));
    }
    case 'info':
      return reply(i, eph({ embeds: [ctx.embeds.tank(tankOpt(ctx, i))] }));
    case 'add': {
      const tank = s.tanks.add(
        {
          display_name: i.options.getString('display_name', true),
          name_id: i.options.getString('name_id', true),
          era: i.options.getString('era', true),
          nation: i.options.getString('nation'),
          vehicle_type: i.options.getString('type'),
          tier: i.options.getInteger('tier') ?? 1,
          year_introduced: i.options.getInteger('year'),
          notes: i.options.getString('notes'),
        },
        actor,
        { aliases: splitAliases(i.options.getString('aliases') ?? '') },
      );
      return reply(i, eph({ embeds: [ctx.embeds.success(`Added **${tank.display_name}** (NameID \`${tank.name_id}\`).`)] }));
    }
    case 'edit': {
      const tank = tankOpt(ctx, i);
      const patch = {};
      const map = { display_name: 'display_name', name_id: 'name_id', era: 'era', nation: 'nation', type: 'vehicle_type', notes: 'notes' };
      for (const [opt, key] of Object.entries(map)) {
        const v = i.options.getString(opt);
        if (v !== null) patch[key] = v;
      }
      const tier = i.options.getInteger('tier');
      if (tier !== null) patch.tier = tier;
      const year = i.options.getInteger('year');
      if (year !== null) patch.year_introduced = year;
      const al = i.options.getString('aliases');
      if (al !== null) patch.aliases = splitAliases(al);
      if (i.options.getBoolean('mark_reviewed')) patch.markReviewed = true;
      if (!Object.keys(patch).length) throw new ValidationError('Nothing to change - provide at least one option.');
      const updated = s.tanks.update(tank.id, patch, actor);
      return reply(i, eph({ embeds: [ctx.embeds.success(`Updated **${updated.display_name}**.`), ctx.embeds.tank(updated)] }));
    }
    case 'remove': {
      const tank = tankOpt(ctx, i);
      s.tanks.remove(tank.id, actor);
      return reply(i, eph({ embeds: [ctx.embeds.success(`Removed **${tank.display_name}** from the catalogue.`)] }));
    }
    case 'enable':
    case 'disable': {
      const tank = tankOpt(ctx, i);
      s.tanks.setEnabled(tank.id, sub === 'enable', actor);
      return reply(i, eph({ embeds: [ctx.embeds.success(`${sub === 'enable' ? 'Enabled' : 'Disabled'} **${tank.display_name}**.`)] }));
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

module.exports = { data, execute, autocomplete: auto };
