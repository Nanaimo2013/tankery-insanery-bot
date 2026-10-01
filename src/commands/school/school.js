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
const { SIDES } = require('../../../config/matches');
const lists = require('../../ui/lists');
const { readJsonAttachment } = require('../../utils/attachments');

const data = new SlashCommandBuilder()
  .setName('school')
  .setDescription('Browse and manage schools and their loadouts')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('list').setDescription('List all schools'))
  .addSubcommand((s) => addSchool(s.setName('view').setDescription('School overview')))
  .addSubcommand((s) => addSchool(s.setName('tanks').setDescription('Vehicles (with quantities) owned by a school')))
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a school (TI Admin)')
      .addStringOption((o) => o.setName('name').setDescription('Full school name').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('short_name').setDescription('Short name').setMaxLength(40))
      .addStringOption((o) => o.setName('country').setDescription('Country').setMaxLength(60))
      .addStringOption((o) => o.setName('description').setDescription('Description').setMaxLength(1000))
      .addRoleOption((o) => o.setName('role').setDescription('Discord role for this school')),
  )
  .addSubcommand((s) =>
    addSchool(s.setName('edit').setDescription('Edit a school (TI Admin)'))
      .addStringOption((o) => o.setName('name').setDescription('New name').setMaxLength(100))
      .addStringOption((o) => o.setName('short_name').setDescription('New short name').setMaxLength(40))
      .addStringOption((o) => o.setName('country').setDescription('New country').setMaxLength(60))
      .addStringOption((o) => o.setName('description').setDescription('New description').setMaxLength(1000))
      .addRoleOption((o) => o.setName('role').setDescription('Discord role'))
      .addBooleanOption((o) => o.setName('enabled').setDescription('Enable or disable the school')),
  )
  .addSubcommand((s) =>
    addSchool(s.setName('remove').setDescription('Delete a school (TI Admin)')).addBooleanOption((o) => o.setName('confirm').setDescription('Set to true to confirm deletion').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('import')
      .setDescription('Import schools/loadouts from a JSON file (TI Admin)')
      .addAttachmentOption((o) => o.setName('file').setDescription('JSON file ({"schools":[…]})').setRequired(true))
      .addBooleanOption((o) => o.setName('replace').setDescription('Replace existing inventories instead of merging')),
  )
  .addSubcommand((s) =>
    addSchool(s.setName('export').setDescription('Export a school loadout (TI Admin)'), 'School (leave empty for all)', false).addStringOption((o) =>
      o.setName('format').setDescription('File format').addChoices({ name: 'Importable data (JSON)', value: 'raw' }, { name: 'MTC loadout (JSON)', value: 'mtc' }),
    ).addStringOption((o) => o.setName('team').setDescription('MTC format only: which team the school plays for').addChoices({ name: SIDES.H.name, value: 'H' }, { name: SIDES.E.name, value: 'E' })),
  );


const qty = (o, min = 1) => o.setName('quantity').setDescription('Quantity').setRequired(true).setMinValue(min).setMaxValue(9999);
const teamChoices = [{ name: SIDES.H.name, value: 'H' }, { name: SIDES.E.name, value: 'E' }];

data.addSubcommandGroup((g) =>
  g
    .setName('loadout')
    .setDescription('A school\'s permanent inventory')
    .addSubcommand((x) => addSchool(x.setName('view').setDescription('View a school loadout (TI Referee)')))
    .addSubcommand((x) => addTank(addSchool(x.setName('add-tank').setDescription('Add vehicles to a school (TI Admin)'))).addIntegerOption((o) => qty(o)).addStringOption((o) => o.setName('requirement').setDescription('Special requirement text').setMaxLength(500)))
    .addSubcommand((x) =>
      addTank(addSchool(x.setName('remove-tank').setDescription('Remove vehicles from a school (TI Admin)'))).addIntegerOption((o) => o.setName('quantity').setDescription('How many to remove (empty = remove entry entirely)').setMinValue(1).setMaxValue(9999)),
    )
    .addSubcommand((x) => addTank(addSchool(x.setName('set-quantity').setDescription('Set an exact quantity (TI Admin)'))).addIntegerOption((o) => qty(o, 0)))
    .addSubcommand((x) => addEquipment(addSchool(x.setName('add-equipment').setDescription('Give a school equipment (TI Admin)'))))
    .addSubcommand((x) => addEquipment(addSchool(x.setName('remove-equipment').setDescription('Remove school equipment (TI Admin)'))))
    .addSubcommand((x) => addSchool(x.setName('add-camo').setDescription('Add a camouflage (TI Admin)')).addStringOption((o) => o.setName('camo').setDescription('Camouflage name').setRequired(true).setMaxLength(100)))
    .addSubcommand((x) => addAuto(addSchool(x.setName('remove-camo').setDescription('Remove a camouflage (TI Admin)')), 'camo', 'Camouflage name'))
    .addSubcommand((x) =>
      addSchool(x.setName('set-requirement').setDescription('Set/clear a special requirement (TI Admin)'))
        .addStringOption((o) => o.setName('text').setDescription('Requirement text (empty = clear)').setMaxLength(500))
        .addStringOption((o) => o.setName('tank').setDescription('Attach to a vehicle instead of the school').setAutocomplete(true)),
    ),
);

const ok = (ctx, i, text) => reply(i, eph({ embeds: [ctx.embeds.success(text)] }));

async function executeLoadout(ctx, i, sub) {
  const s = ctx.services;
  const actor = auditActor(i);
  const school = schoolOpt(ctx, i);
  switch (sub) {
    case 'view':
      return reply(i, eph({ embeds: [ctx.embeds.school(s.loadouts.getLoadout(school.id))] }));
    case 'add-tank': {
      const tank = tankOpt(ctx, i);
      const q = i.options.getInteger('quantity', true);
      s.loadouts.addTank(school.id, tank.id, q, actor, { requirement: i.options.getString('requirement') });
      return ok(ctx, i, `Added ${tank.display_name} ×${q} to ${withEmoji(school)}.`);
    }
    case 'remove-tank': {
      const tank = tankOpt(ctx, i);
      const r = s.loadouts.removeTank(school.id, tank.id, i.options.getInteger('quantity'), actor);
      return ok(ctx, i, r.current === 0 ? `Removed ${tank.display_name} from ${withEmoji(school)}.` : `Removed ${r.previous - r.current}× ${tank.display_name} from ${withEmoji(school)} (now ×${r.current}).`);
    }
    case 'set-quantity': {
      const tank = tankOpt(ctx, i);
      const q = i.options.getInteger('quantity', true);
      const r = s.loadouts.setQuantity(school.id, tank.id, q, actor);
      return ok(ctx, i, `Set ${tank.display_name} to ×${q} for ${withEmoji(school)} (was ×${r.previous}).`);
    }
    case 'add-equipment': {
      const eq = equipmentOpt(ctx, i);
      s.loadouts.addEquipment(school.id, eq.id, actor);
      return ok(ctx, i, `Added ${eq.name} to ${withEmoji(school)}.`);
    }
    case 'remove-equipment': {
      const eq = equipmentOpt(ctx, i);
      s.loadouts.removeEquipment(school.id, eq.id, actor);
      return ok(ctx, i, `Removed ${eq.name} from ${withEmoji(school)}.`);
    }
    case 'add-camo': {
      const r = s.loadouts.addCamo(school.id, i.options.getString('camo', true), actor);
      return ok(ctx, i, `Added camouflage “${r.camo}” to ${withEmoji(school)}.`);
    }
    case 'remove-camo': {
      const camo = i.options.getString('camo', true);
      s.loadouts.removeCamo(school.id, camo, actor);
      return ok(ctx, i, `Removed camouflage “${camo}” from ${withEmoji(school)}.`);
    }
    case 'set-requirement': {
      const tankRaw = i.options.getString('tank');
      const tank = tankRaw ? s.tanks.find(tankRaw) : null;
      if (tankRaw && !tank) throw new ValidationError('That vehicle was not found.');
      s.loadouts.setRequirement(school.id, tank?.id ?? null, i.options.getString('text'), actor);
      return ok(ctx, i, `Updated the special requirement for ${tank ? `${tank.display_name} (${withEmoji(school)})` : school.name}.`);
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

async function execute(ctx, i) {
  if (i.options.getSubcommandGroup(false) === 'loadout') return executeLoadout(ctx, i, i.options.getSubcommand());
  return executeMain(ctx, i);
}

async function executeMain(ctx, i) {
  const sub = i.options.getSubcommand();
  const s = ctx.services;
  const actor = auditActor(i);
  switch (sub) {
    case 'list':
      return reply(i, eph(lists.render(ctx, 'school', 0, '-', i.user)));
    case 'view': {
      const school = schoolOpt(ctx, i);
      return reply(i, eph({ embeds: [ctx.embeds.school(s.loadouts.getLoadout(school.id))] }));
    }
    case 'tanks': {
      const school = schoolOpt(ctx, i);
      return reply(i, eph(lists.render(ctx, 'schooltanks', 0, String(school.id), i.user)));
    }
    case 'add': {
      const school = s.schools.add(
        {
          name: i.options.getString('name', true),
          short_name: i.options.getString('short_name'),
          country: i.options.getString('country'),
          description: i.options.getString('description'),
          discord_role_id: i.options.getRole('role')?.id ?? null,
        },
        actor,
      );
      return reply(i, eph({ embeds: [ctx.embeds.success(`Added school **${withEmoji(school)}**.`)] }));
    }
    case 'edit': {
      const school = schoolOpt(ctx, i);
      const patch = {};
      for (const k of ['name', 'short_name', 'country', 'description']) {
        const v = i.options.getString(k);
        if (v !== null) patch[k] = v;
      }
      const role = i.options.getRole('role');
      if (role) patch.discord_role_id = role.id;
      const en = i.options.getBoolean('enabled');
      if (en !== null) patch.enabled = en;
      if (!Object.keys(patch).length) throw new ValidationError('Nothing to change - provide at least one option.');
      const updated = s.schools.update(school.id, patch, actor);
      return reply(i, eph({ embeds: [ctx.embeds.success(`Updated **${updated.name}**.`)] }));
    }
    case 'remove': {
      const school = schoolOpt(ctx, i);
      if (!i.options.getBoolean('confirm', true)) throw new ValidationError('Deletion not confirmed - nothing was changed.');
      s.schools.remove(school.id, actor);
      return reply(i, eph({ embeds: [ctx.embeds.success(`Removed school **${withEmoji(school)}**.`)] }));
    }
    case 'import': {
      await i.deferReply({ flags: 64 });
      const json = await readJsonAttachment(i.options.getAttachment('file', true));
      const sum = s.loadouts.importData(json, { replace: Boolean(i.options.getBoolean('replace')), actor });
      return reply(i, {
        embeds: [
          ctx.embeds.success(
            `Imported **${sum.schools}** school(s) (${sum.schoolsCreated} new), **${sum.entries}** vehicle entries.\n` +
              `New catalogue vehicles needing review: **${sum.tanksCreated}** • equipment: **${sum.equipmentCreated}** • quantities needing verification: **${sum.quantityReview}**`,
          ),
        ],
      });
    }
    case 'export': {
      const raw = i.options.getString('school');
      const format = i.options.getString('format') ?? 'raw';
      if (raw) {
        const school = schoolOpt(ctx, i);
        const data = format === 'mtc' ? s.loadouts.exportMtc(school.id, i.options.getString('team') ?? 'H') : s.loadouts.exportRaw(school.id);
        const slug = school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return reply(i, eph({ content: `📦 ${withEmoji(school)}`, files: [jsonFile(`${slug}-${format}.json`, JSON.stringify(data, null, 2))] }));
      }
      if (format === 'mtc') throw new ValidationError('MTC format needs a specific school.');
      return reply(i, eph({ content: '📦 All schools', files: [jsonFile('schools-export.json', JSON.stringify(s.loadouts.exportAllRaw(), null, 2))] }));
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

module.exports = { data, execute, autocomplete: auto };
