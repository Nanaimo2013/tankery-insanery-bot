/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { withEmoji } = require('../../../config/emojis');

const { SlashCommandBuilder } = require('discord.js');
const { ValidationError } = require('../../utils/validators');
const { eph, reply, auditActor, schoolOpt, tankOpt, equipmentOpt, addSchool, addTank, addEquipment, addAuto, jsonFile, autocomplete: auto } = require('../../ui/common');
const { readJsonAttachment } = require('../../utils/attachments');

const qty = (o, min = 1) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(min).setMaxValue(9999);

const data = new SlashCommandBuilder()
  .setName('loadout')
  .setDescription('Manage permanent school inventories')
  .setDMPermission(false)
  .addSubcommand((s) => addSchool(s.setName('view').setDescription('View a school loadout')))
  .addSubcommand((s) =>
    addTank(addSchool(s.setName('add-tank').setDescription('Add vehicles to a school (TI Admin)')))
      .addIntegerOption((o) => qty(o))
      .addStringOption((o) => o.setName('requirement').setDescription('Special requirement text').setMaxLength(500)),
  )
  .addSubcommand((s) =>
    addTank(addSchool(s.setName('remove-tank').setDescription('Remove vehicles from a school (TI Admin)'))).addIntegerOption((o) =>
      o.setName('quantity').setDescription('How many to remove (empty = remove entry entirely)').setMinValue(1).setMaxValue(9999),
    ),
  )
  .addSubcommand((s) => addTank(addSchool(s.setName('set-quantity').setDescription('Set an exact quantity (TI Admin)'))).addIntegerOption((o) => qty(o, 0)))
  .addSubcommand((s) => addEquipment(addSchool(s.setName('add-equipment').setDescription('Give a school equipment (TI Admin)'))))
  .addSubcommand((s) => addEquipment(addSchool(s.setName('remove-equipment').setDescription('Remove school equipment (TI Admin)'))))
  .addSubcommand((s) => addSchool(s.setName('add-camo').setDescription('Add a camouflage (TI Admin)')).addStringOption((o) => o.setName('camo').setDescription('Camouflage name').setRequired(true).setMaxLength(100)))
  .addSubcommand((s) => addAuto(addSchool(s.setName('remove-camo').setDescription('Remove a camouflage (TI Admin)')), 'camo', 'Camouflage name'))
  .addSubcommand((s) =>
    addSchool(s.setName('set-requirement').setDescription('Set/clear a special requirement (TI Admin)'))
      .addStringOption((o) => o.setName('text').setDescription('Requirement text (empty = clear)').setMaxLength(500))
      .addStringOption((o) => o.setName('tank').setDescription('Attach to a vehicle instead of the school').setAutocomplete(true)),
  )
  .addSubcommand((s) =>
    addSchool(s.setName('export').setDescription('Export a loadout (TI Admin)')).addStringOption((o) =>
      o.setName('format').setDescription('File format').addChoices({ name: 'MTC loadout (JSON)', value: 'mtc' }, { name: 'Importable data (JSON)', value: 'raw' }),
    ),
  )
  .addSubcommand((s) =>
    s
      .setName('import')
      .setDescription('Import loadouts from JSON (TI Admin)')
      .addAttachmentOption((o) => o.setName('file').setDescription('JSON file ({"schools":[…]})').setRequired(true))
      .addBooleanOption((o) => o.setName('replace').setDescription('Replace existing inventories instead of merging')),
  );

const ok = (ctx, i, text) => reply(i, eph({ embeds: [ctx.embeds.success(text)] }));

async function execute(ctx, i) {
  const sub = i.options.getSubcommand();
  const s = ctx.services;
  const actor = auditActor(i);
  switch (sub) {
    case 'view': {
      const school = schoolOpt(ctx, i);
      return reply(i, eph({ embeds: [ctx.embeds.school(s.loadouts.getLoadout(school.id))] }));
    }
    case 'add-tank': {
      const school = schoolOpt(ctx, i);
      const tank = tankOpt(ctx, i);
      const q = i.options.getInteger('quantity', true);
      s.loadouts.addTank(school.id, tank.id, q, actor, { requirement: i.options.getString('requirement') });
      return ok(ctx, i, `Added ${tank.display_name} ×${q} to ${withEmoji(school)}.`);
    }
    case 'remove-tank': {
      const school = schoolOpt(ctx, i);
      const tank = tankOpt(ctx, i);
      const r = s.loadouts.removeTank(school.id, tank.id, i.options.getInteger('quantity'), actor);
      return ok(ctx, i, r.current === 0 ? `Removed ${tank.display_name} from ${withEmoji(school)}.` : `Removed ${r.previous - r.current}× ${tank.display_name} from ${withEmoji(school)} (now ×${r.current}).`);
    }
    case 'set-quantity': {
      const school = schoolOpt(ctx, i);
      const tank = tankOpt(ctx, i);
      const q = i.options.getInteger('quantity', true);
      const r = s.loadouts.setQuantity(school.id, tank.id, q, actor);
      return ok(ctx, i, `Set ${tank.display_name} to ×${q} for ${withEmoji(school)} (was ×${r.previous}).`);
    }
    case 'add-equipment': {
      const school = schoolOpt(ctx, i);
      const eq = equipmentOpt(ctx, i);
      s.loadouts.addEquipment(school.id, eq.id, actor);
      return ok(ctx, i, `Added ${eq.name} to ${withEmoji(school)}.`);
    }
    case 'remove-equipment': {
      const school = schoolOpt(ctx, i);
      const eq = equipmentOpt(ctx, i);
      s.loadouts.removeEquipment(school.id, eq.id, actor);
      return ok(ctx, i, `Removed ${eq.name} from ${withEmoji(school)}.`);
    }
    case 'add-camo': {
      const school = schoolOpt(ctx, i);
      const r = s.loadouts.addCamo(school.id, i.options.getString('camo', true), actor);
      return ok(ctx, i, `Added camouflage “${r.camo}” to ${withEmoji(school)}.`);
    }
    case 'remove-camo': {
      const school = schoolOpt(ctx, i);
      const camo = i.options.getString('camo', true);
      s.loadouts.removeCamo(school.id, camo, actor);
      return ok(ctx, i, `Removed camouflage “${camo}” from ${withEmoji(school)}.`);
    }
    case 'set-requirement': {
      const school = schoolOpt(ctx, i);
      const tankRaw = i.options.getString('tank');
      const tank = tankRaw ? s.tanks.find(tankRaw) : null;
      if (tankRaw && !tank) throw new ValidationError('That vehicle was not found.');
      s.loadouts.setRequirement(school.id, tank?.id ?? null, i.options.getString('text'), actor);
      return ok(ctx, i, `Updated the special requirement for ${tank ? `${tank.display_name} (${withEmoji(school)})` : school.name}.`);
    }
    case 'export': {
      const school = schoolOpt(ctx, i);
      const format = i.options.getString('format') ?? 'mtc';
      const data = format === 'raw' ? s.loadouts.exportRaw(school.id) : s.loadouts.exportMtc(school.id);
      const slug = school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return reply(i, eph({ content: `📦 ${withEmoji(school)} (${format})`, files: [jsonFile(`${slug}-${format}.json`, JSON.stringify(data, null, 2))] }));
    }
    case 'import': {
      await i.deferReply({ flags: 64 });
      const json = await readJsonAttachment(i.options.getAttachment('file', true));
      const sum = s.loadouts.importData(json, { replace: Boolean(i.options.getBoolean('replace')), actor });
      return reply(i, { embeds: [ctx.embeds.success(`Imported **${sum.schools}** school(s), **${sum.entries}** vehicle entries. ⚠️ Needing review - vehicles: ${sum.tanksCreated}, equipment: ${sum.equipmentCreated}, quantities: ${sum.quantityReview}.`)] });
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

module.exports = { data, execute, autocomplete: auto };
