/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { ValidationError } = require('../../utils/validators');
const { WEAPON_CLASSES, SLOTS } = require('../../../config/mtc');
const { eph, reply, auditActor, equipmentOpt, addEquipment, autocomplete: auto } = require('../../ui/common');
const lists = require('../../ui/lists');
const panels = require('../../ui/panels');

const classChoices = WEAPON_CLASSES.map((c) => ({ name: c, value: c }));
const slotChoices = SLOTS.map((c) => ({ name: c, value: c }));

const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('TI Admin tools')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('panel').setDescription('Open the admin panel'))
  .addSubcommand((s) => s.setName('validate-database').setDescription('Run database quality checks'))
  .addSubcommand((s) =>
    s
      .setName('config')
      .setDescription('View or change runtime settings')
      .addStringOption((o) => o.setName('setting').setDescription('Setting to change').addChoices({ name: 'allowed_eras', value: 'allowed_eras' }))
      .addStringOption((o) => o.setName('value').setDescription('allowed_eras: e.g. WWI,WWII').setMaxLength(100)),
  )
  .addSubcommand((s) => s.setName('backup').setDescription('Create a database backup now'))
  .addSubcommand((s) => s.setName('audit').setDescription('Browse the audit log'))
  .addSubcommandGroup((g) =>
    g
      .setName('equipment')
      .setDescription('Manage the equipment catalogue')
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Add equipment to the catalogue')
          .addStringOption((o) => o.setName('name').setDescription('Friendly name').setRequired(true).setMaxLength(100))
          .addStringOption((o) => o.setName('name_id').setDescription('Exact MTC NameID').setRequired(true).setMaxLength(100))
          .addStringOption((o) => o.setName('class').setDescription('Weapon class').setRequired(true).addChoices(...classChoices))
          .addStringOption((o) => o.setName('slot').setDescription('Slot').setRequired(true).addChoices(...slotChoices))
          .addIntegerOption((o) => o.setName('tier').setDescription('Tier').setMinValue(0).setMaxValue(20))
          .addStringOption((o) => o.setName('aliases').setDescription('Alternative names, separated by ;').setMaxLength(300)),
      )
      .addSubcommand((s) =>
        addEquipment(s.setName('edit').setDescription('Edit equipment (marks it verified)'))
          .addStringOption((o) => o.setName('name').setDescription('New name').setMaxLength(100))
          .addStringOption((o) => o.setName('name_id').setDescription('Exact MTC NameID').setMaxLength(100))
          .addStringOption((o) => o.setName('class').setDescription('Weapon class').addChoices(...classChoices))
          .addStringOption((o) => o.setName('slot').setDescription('Slot').addChoices(...slotChoices))
          .addIntegerOption((o) => o.setName('tier').setDescription('Tier').setMinValue(0).setMaxValue(20))
          .addBooleanOption((o) => o.setName('enabled').setDescription('Enable or disable')),
      )
      .addSubcommand((s) => addEquipment(s.setName('remove').setDescription('Delete equipment')))
      .addSubcommand((s) =>
        s
          .setName('base')
          .setDescription('The basics every new match gives to ALL teams (RemoveVehicle is always included)')
          .addStringOption((o) => o.setName('action').setDescription('What to do').setRequired(true).addChoices({ name: 'List', value: 'list' }, { name: 'Add to the basics', value: 'add' }, { name: 'Remove from the basics', value: 'remove' }))
          .addStringOption((o) => o.setName('equipment').setDescription('Equipment (for add / remove)').setAutocomplete(true)),
      ),
  );

const ok = (ctx, i, text) => reply(i, eph({ embeds: [ctx.embeds.success(text)] }));

async function executeEquipment(ctx, i, sub) {
  const s = ctx.services;
  const actor = auditActor(i);
  switch (sub) {
    case 'add': {
      const eq = s.equipment.add(
        { name: i.options.getString('name', true), name_id: i.options.getString('name_id', true), class_name: i.options.getString('class', true), slot: i.options.getString('slot', true), tier: i.options.getInteger('tier') ?? 1 },
        actor,
        { aliases: (i.options.getString('aliases') ?? '').split(';').map((a) => a.trim()).filter(Boolean) },
      );
      return ok(ctx, i, `Added equipment **${eq.name}** (\`${eq.name_id}\`, ${eq.class_name}/${eq.slot}).`);
    }
    case 'edit': {
      const eq = equipmentOpt(ctx, i);
      const patch = {};
      for (const [opt, key] of [['name', 'name'], ['name_id', 'name_id'], ['class', 'class_name'], ['slot', 'slot']]) {
        const v = i.options.getString(opt);
        if (v !== null) patch[key] = v;
      }
      const tier = i.options.getInteger('tier');
      if (tier !== null) patch.tier = tier;
      const en = i.options.getBoolean('enabled');
      if (en !== null) patch.enabled = en;
      const u = s.equipment.update(eq.id, patch, actor);
      return ok(ctx, i, `Updated **${u.name}** (\`${u.name_id}\`, ${u.class_name}/${u.slot}, tier ${u.tier}).`);
    }
    case 'remove': {
      const eq = equipmentOpt(ctx, i);
      s.equipment.remove(eq.id, actor);
      return ok(ctx, i, `Removed equipment **${eq.name}**.`);
    }
    case 'base': {
      const action = i.options.getString('action', true);
      const cur = s.settings.getBaseEquipmentIds();
      if (action !== 'list') {
        const eq = equipmentOpt(ctx, i);
        if (eq.needs_review) throw new ValidationError(`${eq.name} has no verified MTC NameID yet - verify it with /admin equipment edit first.`);
        const next = action === 'add' ? [...cur, eq.id] : cur.filter((x) => x !== eq.id);
        s.settings.setBaseEquipmentIds(next, actor, eq.name);
      }
      const names = s.settings.getBaseEquipmentIds().map((id) => s.equipment.get(id)?.name).filter(Boolean);
      return reply(i, eph({ embeds: [ctx.embeds.info(`**RemoveVehicle** (always)\n${names.map((n) => `• ${n}`).join('\n') || '_No other basics._'}\n\nNew matches start with these in the all-teams section; the referee can still adjust them per match.`, '🧰 Base equipment (all teams)')] }));
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

async function execute(ctx, i) {
  if (i.options.getSubcommandGroup(false) === 'equipment') return executeEquipment(ctx, i, i.options.getSubcommand());
  const sub = i.options.getSubcommand();
  const s = ctx.services;
  const actor = auditActor(i);
  switch (sub) {
    case 'panel':
      return reply(i, eph(panels.adminPanel(ctx)));
    case 'validate-database':
      return panels.runValidation(ctx, i);
    case 'audit':
      return reply(i, eph(lists.render(ctx, 'audit', 0, '-', i.user)));
    case 'backup': {
      await i.deferReply({ flags: 64 });
      const file = await s.backups.run(actor);
      return i.editReply({ embeds: [ctx.embeds.success(`Backup created: \`${require('node:path').basename(file)}\``)] });
    }
    case 'config': {
      const setting = i.options.getString('setting');
      const value = i.options.getString('value');
      if (setting) {
        if (value === null) throw new ValidationError('Provide a value for that setting.');
        s.settings.set(setting, value, actor);
      }
      const c = s.settings.all();
      return reply(i, eph({ embeds: [ctx.embeds.info(`**allowed_eras:** ${c.allowed_eras.join(', ')}\n\nRole IDs, channels, limits and backup settings are configured in \`.env\`. Maintenance mode is switched from the server console.`, '⚙️ Configuration')] }));
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

module.exports = { data, execute, autocomplete: auto };
