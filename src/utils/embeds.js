/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { EmbedBuilder } = require('discord.js');
const { STATUS_EMOJI, STATUS_LABEL, SIDES } = require('../../config/matches');
const { truncate, chunkLines, formatLabel, timestamp } = require('./formatters');
const { discordWhen } = require('./time');
const { schoolEmoji, schoolEmojiUrl, withEmoji } = require('../../config/emojis');

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

/** Factory so every embed uses the configured colours/branding. */
function createEmbeds(config) {
  const footer = `🎖️ ${config.bot.name} v${config.bot.version} • ${config.bot.copyright}`;
  const base = (color) => new EmbedBuilder().setColor(color ?? config.colors.primary).setFooter({ text: truncate(footer, 2000) });

  const e = {
    base,
    success: (text, title = '✅ Success') => base(config.colors.success).setTitle(title).setDescription(truncate(text, 4000)),
    error: (text, title = '❌ Error') => base(config.colors.error).setTitle(title).setDescription(truncate(text, 4000)),
    warning: (text, title = '⚠️ Warning') => base(config.colors.warning).setTitle(title).setDescription(truncate(text, 4000)),
    info: (text, title = 'ℹ️ Information') => base(config.colors.info).setTitle(title).setDescription(truncate(text, 4000)),

    audit: (entry, text) =>
      base(config.colors.info).setTitle(`📋 ${entry.category} - ${entry.action}`).setDescription(`\`\`\`\n${truncate(text, 3800)}\n\`\`\``).setTimestamp(new Date()),

    /**
     * @param hydrated result of MatchService.hydrate()
     * @param {{title?:string, refereeLabel?:string, warnings?:string[], result?:{text:string, score:string}}} opts
     */
    match(h, { title, refereeLabel, warnings = [], result = null } = {}) {
      const side = (code) => h.teams.filter((t) => t.side === code);
      const names = (ts) => ts.map((t) => (t.school ? withEmoji(t.school) : '?')).join(' + ') || '-';
      const head = base()
        .setTitle('🎖️ TANKERY INSANERY - MATCH')
        .setDescription(
          [
            RULE,
            `⚔️ **MATCH**\n${truncate(title ?? `${names(side('H'))} (${SIDES.H.emoji} ${SIDES.H.name}) vs ${names(side('E'))} (${SIDES.E.emoji} ${SIDES.E.name})`, 600)}`,
            `📊 **FORMAT**\n${h.hawkCount} vs ${h.eagleCount}  •  ${h.tierCap ? `Tier ${h.tierCap} and below${h.tierCap === 1 ? ' (tier 1 only)' : ''}` : 'No tier limit'}  •  ${h.fullLoadout ? 'Full loadouts' : 'Chosen vehicles'}`,
            `👤 **REFEREE**\n${refereeLabel ?? `<@${h.refereeId}>`}`,
            h.scheduledAt ? `🕒 **TIME** (shown in your own timezone)\n${discordWhen(h.scheduledAt)}` : '🕒 **TIME**\nNot scheduled yet',
            `📅 **STATUS**\n${STATUS_EMOJI[h.status] ?? ''} ${STATUS_LABEL[h.status] ?? h.status}${h.id ? `  •  \`${h.code}\`` : ''}`,
            ...(result && ['ACTIVE', 'COMPLETED'].includes(h.status) ? [`🏁 **${h.status === 'COMPLETED' ? 'RESULT' : 'ROUND WINS'}**\n${result.text}`] : []),
            RULE,
          ].join('\n\n'),
        );
      if (h.status === 'COMPLETED' && h.winner) head.setColor(h.winner === 'H' ? config.colors.hawk : h.winner === 'E' ? config.colors.eagle : config.colors.warning);
      if (h.equipment.length) {
        const eq = [...new Set(h.equipment.map((x) => x.name))].map((n) => `• ${n}`);
        for (const [i, chunk] of chunkLines(eq, 1000).entries()) head.addFields({ name: i ? '🧰 EQUIPMENT - ALL TEAMS (cont.)' : '🧰 EQUIPMENT - ALL TEAMS', value: chunk });
      }
      if (warnings.length) head.addFields({ name: '⚠️ NOTES', value: truncate(warnings.map((w) => `• ${w}`).join('\n'), 1000) });

      const sideEmbed = (code, color) => {
        const info = SIDES[code];
        const em = base(color).setTitle(`${info.emoji} ${info.name.toUpperCase()}`);
        for (const t of side(code).slice(0, 25)) {
          const lines = t.vehicles.length ? t.vehicles.map((v) => `• ${v.tank.display_name} ×${v.quantity}`) : ['_No vehicles selected_'];
          if (t.equipment.length) lines.push(`🧰 ${t.equipment.map((e) => e.name).join(', ')}`);
          if (t.camos.length) lines.push(`🎨 ${t.camos.join(', ')}`);
          const [first, ...rest] = chunkLines(lines, 1000);
          em.addFields({ name: truncate(`${t.school ? schoolEmoji(t.school) : '🏫'} ${t.school?.name ?? 'Unknown school'} (${info.name})`, 250), value: first ?? '-' });
          for (const c of rest) em.addFields({ name: '↳ (cont.)', value: c });
          if (em.data.fields.length >= 24) break;
        }
        return em;
      };
      return [head, sideEmbed('H', config.colors.hawk), sideEmbed('E', config.colors.eagle)];
    },

    maintenance(state) {
      const lines = ['🛠️ **Tankery Insanery is down for maintenance.**', 'Commands are switched off for now - please try again later.'];
      if (state.reason) lines.push(`\n**Reason:** ${truncate(state.reason, 300)}`);
      if (state.since) lines.push(`\n**Since:** <t:${state.since}:R>`);
      return base(config.colors.warning).setTitle('🛠️ Down for maintenance').setDescription(lines.join('\n'));
    },

    school(loadout) {
      const { school, tanks, equipment, camos } = loadout;
      const em = base()
        .setTitle(`${schoolEmoji(school)} ${school.name}`)
        .setDescription(truncate([school.description, school.notes].filter(Boolean).join('\n\n') || '_No description._', 1500));
      if (schoolEmojiUrl(school)) em.setThumbnail(schoolEmojiUrl(school));
      em.addFields(
        { name: 'Short name', value: school.short_name || '-', inline: true },
        { name: 'Country', value: school.country || '-', inline: true },
        { name: 'Status', value: school.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
      );
      const veh = tanks.map((t) => `• ${t.display_name} - ${t.quantity_needs_review ? '⚠️ qty unverified' : `×${t.quantity}`}${t.special_requirements ? ` _(${t.special_requirements})_` : ''}`);
      const vch = chunkLines(veh.length ? veh : ['_None_'], 1000);
      vch.slice(0, 4).forEach((c, i) => em.addFields({ name: i ? '🚜 Vehicles (cont.)' : `🚜 Vehicles (${tanks.length})`, value: c }));
      if (vch.length > 4) em.addFields({ name: '…', value: `Use \`/school tanks\` to see all ${tanks.length} vehicles.` });
      em.addFields({ name: '🧰 Equipment', value: truncate(equipment.length ? equipment.map((x) => `• ${x.name}`).join('\n') : '_None_', 1000) });
      em.addFields({ name: '🎨 Camouflage', value: truncate(camos.length ? camos.join(', ') : '_None_', 1000) });
      if (loadout.decals.length) em.addFields({ name: '🏷️ Decals', value: truncate(loadout.decals.join(', '), 1000) });
      if (loadout.special_requirements.length) em.addFields({ name: '📌 Special requirements', value: truncate(loadout.special_requirements.map((r) => `• ${r}`).join('\n'), 1000) });
      return em;
    },

    tank(t) {
      const em = base()
        .setTitle(`🚜 ${t.display_name}`)
        .addFields(
          { name: 'MTC NameID', value: `\`${t.name_id}\``, inline: true },
          { name: 'Nation', value: t.nation || '-', inline: true },
          { name: 'Type', value: t.vehicle_type || '-', inline: true },
          { name: 'Era', value: formatLabel(t.era), inline: true },
          { name: 'Tier', value: String(t.tier), inline: true },
          { name: 'Year', value: t.year_introduced ? String(t.year_introduced) : '-', inline: true },
          { name: 'Status', value: `${t.enabled ? '🟢 Enabled' : '🔴 Disabled'}${t.needs_review ? ' • ⚠️ NameID needs review' : ''}`, inline: false },
        );
      if (t.aliases.length) em.addFields({ name: 'Aliases', value: truncate(t.aliases.join(', '), 1000) });
      if (t.notes) em.addFields({ name: 'Notes', value: truncate(t.notes, 1000) });
      return em;
    },

    timestamp,
  };
  return e;
}

module.exports = { createEmbeds, RULE };
