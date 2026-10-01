/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const path = require('node:path');
const { ValidationError } = require('../utils/validators');
const { truncate, timestamp } = require('../utils/formatters');
const { ValidationService } = require('../services/ValidationService');
const { eph, reply, updateOrReply, jsonFile } = require('./common');
const lists = require('./lists');

const ADMIN_SECTIONS = [
  { value: 'schools', label: '🏫 Schools' },
  { value: 'tanks', label: '🚜 Tanks' },
  { value: 'equipment', label: '🧰 Equipment' },
  { value: 'camo', label: '🎨 Camouflage' },
  { value: 'matches', label: '⚔️ Matches' },
  { value: 'loadouts', label: '📦 Loadouts' },
  { value: 'audit', label: '📋 Audit Logs' },
  { value: 'config', label: '⚙️ Configuration' },
  { value: 'backups', label: '💾 Backups' },
];

function adminPanel(ctx, section = 'home') {
  const s = ctx.services;
  const em = ctx.embeds.base().setTitle('🎖️ Tankery Insanery Admin Panel');
  const count = (sql) => s.db.prepare(sql).get().n;
  if (section === 'home') {
    em.setDescription(`${ADMIN_SECTIONS.map((x) => x.label).join('\n')}\n\nPick a section below.`);
  } else if (section === 'schools') {
    em.setTitle('🏫 Schools').setDescription(`**${s.schools.count()}** schools (${count('SELECT COUNT(*) n FROM schools WHERE enabled=0')} disabled).\n\n\`/school add\` • \`/school edit\` • \`/school remove\` • \`/school import\` • \`/school export\``);
  } else if (section === 'tanks') {
    const review = count('SELECT COUNT(*) n FROM tanks WHERE needs_review=1');
    em.setTitle('🚜 Tanks').setDescription(`**${s.tanks.count()}** vehicles - ⚠️ **${review}** need NameID review.\nAllowed eras: **${s.settings.getAllowedEras().join(', ')}**\n\n\`/tank add\` • \`/tank edit\` • \`/tank remove\` • \`/tank enable\` • \`/tank disable\``);
  } else if (section === 'equipment') {
    em.setTitle('🧰 Equipment').setDescription(`**${s.equipment.count()}** equipment entries.\n\n\`/admin equipment add\` • \`edit\` • \`remove\` • \`base\``);
  } else if (section === 'camo') {
    em.setTitle('🎨 Camouflage').setDescription(`**${count('SELECT COUNT(*) n FROM school_camos')}** camouflage entries across schools.\n\n\`/school loadout add-camo\` • \`remove-camo\``);
  } else if (section === 'matches') {
    const rows = s.db.prepare('SELECT status, COUNT(*) n FROM matches GROUP BY status').all();
    em.setTitle('⚔️ Matches').setDescription(`${rows.map((r) => `**${r.status}**: ${r.n}`).join(' • ') || 'No matches yet.'}\n\nAdmins can edit, cancel or re-open any match from \`/match view\`.`);
  } else if (section === 'loadouts') {
    em.setTitle('📦 Loadouts').setDescription(`**${count('SELECT COUNT(*) n FROM school_tanks')}** inventory entries (⚠️ ${count('SELECT COUNT(*) n FROM school_tanks WHERE quantity_needs_review=1')} quantities need verification).\n\n\`/school loadout add-tank\` • \`set-quantity\` • \`remove-tank\` • \`add-equipment\` • \`/school export\` • \`/school import\``);
  } else if (section === 'audit') {
    em.setTitle('📋 Audit Logs').setDescription(`**${s.audit.count()}** entries stored. Use the button below to browse them.`);
  } else if (section === 'config') {
    const c = s.settings.all();
    em.setTitle('⚙️ Configuration').setDescription(`Allowed eras: **${c.allowed_eras.join(', ')}**\nBase equipment (all teams): **${c.base_equipment.length}** item(s)\nMax teams per side: **${ctx.config.matches.maxTeams}** • Max schools: **${ctx.config.matches.maxSchools}**\nDuplicate schools: **${ctx.config.matches.allowDuplicateSchools ? 'allowed' : 'blocked'}**\n\nChange runtime settings with \`/admin config\`. Role IDs and channels live in \`.env\`.`);
  } else if (section === 'backups') {
    const list = s.backups.list();
    em.setTitle('💾 Backups').setDescription(`Automatic: **${ctx.config.backups.enabled ? `every ${ctx.config.backups.intervalHours}h` : 'off'}** • keeping ${ctx.config.backups.keep}\n\n${list.slice(0, 10).map((b) => `• \`${b.name}\` (${Math.round(b.size / 1024)} KB)`).join('\n') || '_No backups yet._'}`);
  }
  const components = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('pn:admin:sec').setPlaceholder('Navigate…').addOptions(ADMIN_SECTIONS.map((x) => ({ ...x, default: x.value === section }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pn:admin:validate').setLabel('🔍 Validate database').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pn:admin:backup').setLabel('💾 Backup now').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pn:admin:audit').setLabel('📋 Browse audit log').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pn:admin:home').setLabel('🏠 Home').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [em], components, content: '' };
}

function refereePanel(ctx) {
  const em = ctx.embeds
    .base()
    .setTitle('🎖️ Tankery Insanery Referee Panel')
    .setDescription('⚔️ Create Match\n📋 My Matches\n🏫 Browse Schools\n🚜 Browse Tanks\n📦 Export Loadout\n\nOpen a match from **My Matches** to start it, record round wins, set the time or change the referee - those controls are private to you.');
  const b = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`pn:ref:${id}`).setLabel(label).setStyle(style);
  return {
    embeds: [em],
    content: '',
    components: [
      new ActionRowBuilder().addComponents(b('create', '⚔️ Create Match', ButtonStyle.Success), b('mine', '📋 My Matches', ButtonStyle.Primary), b('schools', '🏫 Browse Schools'), b('tanks', '🚜 Browse Tanks'), b('export', '📦 Export Loadout')),
    ],
  };
}

async function runValidation(ctx, i) {
  const r = ctx.services.validation.run();
  const text = ValidationService.render(r);
  const details = [...r.errors.map((e) => `❌ ${e}`), ...r.warnings.map((w) => `⚠️ ${w}`)];
  const em = (r.ok ? ctx.embeds.success : ctx.embeds.error)(`\`\`\`\n${text}\n\`\`\``, r.ok ? '✅ Database validation' : '❌ Database validation');
  const payload = { embeds: [em] };
  if (details.length) {
    if (details.join('\n').length <= 900) em.addFields({ name: 'Details', value: truncate(details.join('\n'), 1000) });
    else payload.files = [jsonFile(`validation-${timestamp().replace(/[: ]/g, '-')}.txt`, `${text}\n\n${details.join('\n')}\n`)];
  }
  return reply(i, eph(payload));
}

/** Handle `pn:*` navigation. Permissions are re-checked on every click. */
async function handle(ctx, i, parts) {
  const s = ctx.services;
  const [, panel, action] = parts;
  if (panel === 'admin') {
    if (!s.permissions.isAdmin(i.member)) throw new ValidationError('Only TI Admins can use the admin panel.');
    if (action === 'sec') return updateOrReply(i, adminPanel(ctx, i.values[0]));
    if (action === 'home') return updateOrReply(i, adminPanel(ctx, 'home'));
    if (action === 'validate') return runValidation(ctx, i);
    if (action === 'audit') return reply(i, eph(lists.render(ctx, 'audit', 0, '-', i.user)));
    if (action === 'backup') {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const file = await s.backups.run({ id: i.user.id, tag: i.user.tag ?? i.user.username });
      return i.editReply({ embeds: [ctx.embeds.success(`Backup created: \`${path.basename(file)}\``)] });
    }
  }
  if (panel === 'ref') {
    if (!s.permissions.isReferee(i.member)) throw new ValidationError('You need the TI Referee role to use the referee panel.');
    if (action === 'create') return require('./wizard').start(ctx, i);
    if (action === 'mine') return reply(i, eph(lists.render(ctx, 'match', 0, 'mine', i.user)));
    if (action === 'schools') return reply(i, eph(lists.render(ctx, 'school', 0, '-', i.user)));
    if (action === 'tanks') return reply(i, eph(lists.render(ctx, 'tank', 0, '-', i.user)));
    if (action === 'export') {
      const rows = s.matches.list({ refereeId: i.user.id, limit: 25 });
      if (!rows.length) throw new ValidationError('You have no matches to export yet.');
      return reply(i, eph({
        content: 'Pick a match to export:',
        components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('pn:ref:exportpick').setPlaceholder('Select a match').addOptions(rows.map((m) => ({ label: `match-${String(m.id).padStart(4, '0')} - ${m.status}`, description: truncate(s.matches.title(s.matches.load(m.id)), 100), value: String(m.id) }))))],
      }));
    }
    if (action === 'exportpick') return require('./matchUI').sendExport(ctx, i, Number(i.values[0]));
  }
  throw new ValidationError('Unknown panel action.');
}

module.exports = { adminPanel, refereePanel, handle, runValidation };
