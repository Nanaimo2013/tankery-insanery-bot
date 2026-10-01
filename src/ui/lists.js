/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { paginate, truncate, matchCode } = require('../utils/formatters');
const { STATUS_EMOJI } = require('../../config/matches');
const { ValidationError } = require('../utils/validators');
const { updateOrReply } = require('./common');
const { schoolEmoji } = require('../../config/emojis');

const PAGE_SIZE = 12;
const ACTION = { tank: 'tank.list', school: 'school.list', schooltanks: 'school.tanks', match: 'match.list', audit: 'admin.panel' };
const SEARCHABLE = new Set(['tank', 'school']);

const cleanArg = (s) => (String(s ?? '').replace(/[:|]/g, ' ').trim().slice(0, 40) || '-');

/** Build one page of a paginated list. kinds: tank | school | schooltanks | match | audit */
function render(ctx, kind, page, arg, user) {
  const s = ctx.services;
  const { embeds } = ctx;
  const q = arg === '-' ? '' : arg;
  let title;
  let all;
  let pageRows;
  let matchRows = null;
  if (kind === 'tank') {
    title = q ? `🚜 Vehicles matching “${q}”` : '🚜 Vehicles';
    const items = q ? s.tanks.search(q, { limit: 1000 }) : s.tanks.list();
    all = items.map((t) => `**${t.display_name}** - ${[t.nation, t.vehicle_type].filter(Boolean).join(' • ') || '-'} • ${t.era.replace('_', ' ')}${t.enabled ? '' : ' 🔴'}${t.needs_review ? ' ⚠️' : ''}`);
  } else if (kind === 'school') {
    title = q ? `🏫 Schools matching “${q}”` : '🏫 Schools';
    const items = q ? s.schools.search(q, 1000) : s.schools.list();
    all = items.map((x) => `${schoolEmoji(x)} **${x.name}**${x.country ? ` - ${x.country}` : ''}${x.enabled ? '' : ' 🔴 disabled'}`);
  } else if (kind === 'schooltanks') {
    const l = s.loadouts.getLoadout(Number(q));
    title = `${schoolEmoji(l.school)} ${l.school.name} - vehicles`;
    all = l.tanks.map((t) => `**${t.display_name}** - ${t.quantity_needs_review ? '⚠️ quantity needs verification' : `×${t.quantity}`}${t.special_requirements ? `\n   ↳ _${truncate(t.special_requirements, 120)}_` : ''}`);
  } else if (kind === 'match') {
    title = { mine: '📋 My matches', all: '⚔️ All matches', hist: '📜 Match history' }[q] ?? '⚔️ Matches';
    const rows = q === 'mine' ? s.matches.list({ refereeId: user.id, limit: 500 }) : q === 'hist' ? s.matches.history({ limit: 500 }) : s.matches.list({ limit: 500 });
    pageRows = paginate(rows, page, PAGE_SIZE);
    matchRows = pageRows.items;
    all = rows.map((m) => `\`${matchCode(m.id)}\` ${STATUS_EMOJI[m.status]} **${m.status}** - ${s.matches.titleRich(s.matches.load(m.id))} • <@${m.referee_id}>`);
  } else if (kind === 'audit') {
    title = '📋 Audit log';
    const total = s.audit.count();
    const rows = s.audit.list({ limit: 500 });
    all = rows.map((r) => `\`#${r.id}\` ${r.created_at} - **${r.action}**${r.target ? ` • ${truncate(r.target, 60)}` : ''}${r.actor_id ? ` • <@${r.actor_id}>` : ''}`);
    if (total > 500) title += ` (latest 500 of ${total})`;
  } else throw new ValidationError('Unknown list.');

  const p = paginate(all, page, PAGE_SIZE);
  const em = embeds
    .base()
    .setTitle(truncate(title, 250))
    .setDescription(truncate(p.items.join('\n') || '_Nothing to show._', 4000))
    .addFields({ name: '\u200b', value: `Page **${p.page + 1}/${p.pages}** • ${p.total} result${p.total === 1 ? '' : 's'}` });

  const id = (pg) => `ls:${kind}:${pg}:${arg}`;
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id(p.page - 1)).setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(p.page <= 0),
    new ButtonBuilder().setCustomId(id(p.page + 1)).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(p.page >= p.pages - 1),
  );
  if (SEARCHABLE.has(kind)) nav.addComponents(new ButtonBuilder().setCustomId(`ls:search:${kind}`).setLabel('🔎 Search').setStyle(ButtonStyle.Primary));
  const components = [nav];
  if (kind === 'match' && matchRows?.length) {
    const slice = pageRows.items.slice(0, 25);
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mt:open')
          .setPlaceholder('Open a match…')
          .addOptions(slice.map((m) => ({ label: `${matchCode(m.id)} - ${m.status}`, description: truncate(s.matches.title(s.matches.load(m.id)), 100), value: String(m.id) }))),
      ),
    );
  }
  return { embeds: [em], components };
}

/** Handle `ls:*` buttons and the search modal. */
async function handle(ctx, i, parts) {
  const [, kindOrSearch, a, ...rest] = parts;
  if (kindOrSearch === 'search') {
    const kind = a;
    if (!ctx.services.permissions.can(i.member, ACTION[kind])) throw new ValidationError('You do not have permission to do that.');
    if (i.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(`ls:search:${kind}`)
        .setTitle('Search')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Search text').setStyle(TextInputStyle.Short).setMaxLength(40).setRequired(true)));
      return i.showModal(modal);
    }
    const q = cleanArg(i.fields.getTextInputValue('q'));
    return updateOrReply(i, render(ctx, kind, 0, q, i.user));
  }
  const kind = kindOrSearch;
  if (!ACTION[kind] || !ctx.services.permissions.can(i.member, ACTION[kind])) throw new ValidationError('You do not have permission to do that.');
  const arg = rest.join(':') || '-';
  return updateOrReply(i, render(ctx, kind, Number(a) || 0, arg, i.user));
}

module.exports = { render, handle, cleanArg, PAGE_SIZE, ACTION };
