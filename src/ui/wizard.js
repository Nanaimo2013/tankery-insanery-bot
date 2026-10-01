/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const crypto = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { ValidationError, parseQuantity } = require('../utils/validators');
const { truncate, chunkLines, matchCode } = require('../utils/formatters');
const { parseSchedule, discordWhen } = require('../utils/time');
const { FORMAT_PRESETS, SIDES, TIER_CHOICES } = require('../../config/matches');
const { schoolEmoji, schoolEmojiObj } = require('../../config/emojis');
const { eph, actorOf, updateOrReply, jsonFile, reply } = require('./common');
const { MatchService } = require('../services/MatchService');

const STEP_TITLE = {
  format: 'Match format',
  hawk: 'Hawk Republic school(s)',
  eagle: 'Eagle Federation school(s)',
  rules: 'Tier limit, loadout & time',
  tanks: 'Select tanks',
  equipment: 'Equipment',
  review: 'Review',
};
const PAGE = 25;
const TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
}, 5 * 60 * 1000);
sweep.unref?.();

/** Steps for this draft: the tank picker is skipped when every school brings its full loadout. */
const stepsOf = (state) => ['format', 'hawk', 'eagle', 'rules', ...(state.draft.fullLoadout ? [] : ['tanks']), 'equipment', 'review'];

function createSession(userId, state) {
  const id = crypto.randomBytes(4).toString('hex');
  sessions.set(id, { userId, state, expires: Date.now() + TTL_MS });
  return id;
}

function getSession(id, userId) {
  const s = sessions.get(id);
  if (!s || s.expires < Date.now()) {
    sessions.delete(id);
    throw new ValidationError('This match wizard expired. Run `/match create` to start again (saved drafts are kept).');
  }
  if (s.userId !== userId) throw new ValidationError('This wizard belongs to another referee.');
  s.expires = Date.now() + TTL_MS;
  return s;
}

const btn = (sid, action, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(`wz:${sid}:${action}`).setLabel(label).setStyle(style).setDisabled(disabled);
const row = (...c) => new ActionRowBuilder().addComponents(...c);
const listKey = (side) => (side === 'H' ? 'hawk' : 'eagle');
const sideColor = (ctx, code) => (code === 'H' ? ctx.config.colors.hawk : ctx.config.colors.eagle);

function candidates(ctx, state, side) {
  const other = side === 'H' ? state.draft.eagle : state.draft.hawk;
  const dup = ctx.config.matches.allowDuplicateSchools;
  return ctx.services.schools.list({ includeDisabled: false }).filter((s) => dup || !other.includes(s.id));
}

const teamKeys = (draft) => MatchService.teamKeys(draft);

function teamLabel(ctx, draft, key) {
  const school = ctx.services.schools.get(MatchService.schoolForKey(draft, key));
  return `${SIDES[key[0]].short} ${Number(key.slice(1)) + 1} - ${school?.name ?? '?'}`;
}

/** teamLabel with the school's emoji in front (for message text; select menus use teamEmojiObj instead). */
function teamText(ctx, draft, key) {
  const school = ctx.services.schools.get(MatchService.schoolForKey(draft, key));
  return `${schoolEmoji(school)} ${teamLabel(ctx, draft, key)}`;
}
function teamEmojiObj(ctx, draft, key) {
  return schoolEmojiObj(ctx.services.schools.get(MatchService.schoolForKey(draft, key)));
}

function nav(sid, state, extra = []) {
  const idx = stepsOf(state).indexOf(state.step);
  return row(...extra, btn(sid, 'back', '⬅ Back', ButtonStyle.Secondary, idx <= 0), btn(sid, 'cancel', '✖ Cancel', ButtonStyle.Danger));
}

const tierLabel = (cap) => (cap === null ? 'No tier limit' : cap === 1 ? 'Tier 1 only' : `Tier ${cap} and below`);

// ------------------------------------------------------------------ rendering
function render(ctx, sid, state) {
  const { embeds } = ctx;
  const s = ctx.services;
  const steps = stepsOf(state);
  const idx = steps.indexOf(state.step);
  const head = embeds.base().setTitle(`⚔️ Match Wizard - Step ${idx + 1}/${steps.length}: ${STEP_TITLE[state.step]}`);
  const out = { embeds: [head], components: [], content: state.notice ? `⚠️ ${state.notice}` : '' };
  state.notice = null;
  const d = state.draft;

  if (state.step === 'format') {
    head.setDescription('Choose how many schools play for **Hawk Republic** and for **Eagle Federation**. Use **Custom** for uneven sides such as 2 vs 3.');
    const max = ctx.config.matches.maxTeams;
    const opts = FORMAT_PRESETS.filter((n) => n <= max).map((n) => ({ label: `${n} vs ${n}`, value: String(n) }));
    opts.push({ label: 'Custom…', value: 'custom', description: `Any size up to ${max} schools per side` });
    out.components.push(row(new StringSelectMenuBuilder().setCustomId(`wz:${sid}:fmt`).setPlaceholder('Select match format').addOptions(opts)));
    out.components.push(row(btn(sid, 'cancel', '✖ Cancel', ButtonStyle.Danger)));
    if (d.id) head.setFooter({ text: `Editing ${matchCode(d.id)}` });
    return out;
  }

  if (state.step === 'hawk' || state.step === 'eagle') {
    const side = state.step === 'hawk' ? 'H' : 'E';
    const info = SIDES[side];
    const need = side === 'H' ? d.hawkCount : d.eagleCount;
    const chosen = d[listKey(side)];
    const cand = candidates(ctx, state, side);
    const pages = Math.max(1, Math.ceil(cand.length / PAGE));
    state.page = Math.min(state.page ?? 0, pages - 1);
    const slice = cand.slice(state.page * PAGE, state.page * PAGE + PAGE);
    head
      .setColor(sideColor(ctx, side))
      .setDescription(
        `Pick **${need}** school${need === 1 ? '' : 's'} for **${info.emoji} ${info.name}** (${chosen.length}/${need} selected).${pages > 1 ? ` Use ◀ ▶ to browse pages (${state.page + 1}/${pages}).` : ''}\n\n` +
          (chosen.length ? chosen.map((id) => { const sc = s.schools.get(id); return `• ${sc ? `${schoolEmoji(sc)} ${sc.name}` : `#${id}`}`; }).join('\n') : '_Nothing selected yet._'),
      );
    if (!slice.length) head.addFields({ name: 'No schools available', value: 'Ask a TI Admin to add or enable schools.' });
    else {
      out.components.push(
        row(
          new StringSelectMenuBuilder()
            .setCustomId(`wz:${sid}:sch:${state.page}`)
            .setPlaceholder(`Select ${info.short} school(s)`)
            .setMinValues(0)
            .setMaxValues(Math.min(need, slice.length))
            .addOptions(slice.map((x) => ({ label: truncate(x.name, 100), emoji: schoolEmojiObj(x), value: String(x.id), default: chosen.includes(x.id), description: x.country ? truncate(x.country, 100) : undefined }))),
        ),
      );
    }
    const buttons = [];
    if (pages > 1) buttons.push(btn(sid, `page:${state.page - 1}`, '◀', ButtonStyle.Secondary, state.page <= 0), btn(sid, `page:${state.page + 1}`, '▶', ButtonStyle.Secondary, state.page >= pages - 1));
    buttons.push(btn(sid, 'next', 'Confirm ✅', ButtonStyle.Success, chosen.length !== need));
    out.components.push(row(...buttons));
    out.components.push(nav(sid, state));
    return out;
  }

  if (state.step === 'rules') {
    head.setDescription('Set what the schools may bring and when the match is played.');
    head.addFields(
      { name: '🎚️ Tier limit', value: `**${tierLabel(d.tierCap)}**\nVehicles above this tier cannot be brought.`, inline: true },
      { name: '📦 Loadouts', value: d.fullLoadout ? '**Full loadouts** - every school brings everything it owns (within the tier limit).' : '**Chosen vehicles** - you pick the tanks for each school.', inline: true },
      { name: '🕒 Date & time', value: d.scheduledAt ? `${discordWhen(d.scheduledAt)}\n_Entered as ${d.timezone ?? 'UTC'}; everyone sees it in their own timezone._` : '_Not set yet (optional)._' },
    );
    const opts = TIER_CHOICES.map((t) => ({ label: t.label, value: t.value, default: t.cap === d.tierCap }));
    out.components.push(row(new StringSelectMenuBuilder().setCustomId(`wz:${sid}:tier`).setPlaceholder('Tier limit').addOptions(opts)));
    out.components.push(
      row(
        btn(sid, 'full', d.fullLoadout ? '📦 Full loadouts: ON' : '📦 Full loadouts: OFF', d.fullLoadout ? ButtonStyle.Success : ButtonStyle.Secondary),
        btn(sid, 'sched', '📅 Set date & time', ButtonStyle.Primary),
        btn(sid, 'unsched', '🗑 Clear time', ButtonStyle.Secondary, !d.scheduledAt),
      ),
    );
    out.components.push(nav(sid, state, [btn(sid, 'next', 'Continue ➡', ButtonStyle.Success)]));
    return out;
  }

  if (state.step === 'tanks') {
    const keys = teamKeys(d);
    if (!keys.includes(state.tankKey)) state.tankKey = keys[0];
    const key = state.tankKey;
    const school = s.schools.get(MatchService.schoolForKey(d, key));
    const loadout = s.loadouts.getLoadout(school.id);
    const avail = s.loadouts.availableForMatch(school.id, { tierCap: d.tierCap });
    const blocked = s.loadouts.blockedForMatch(school.id, { tierCap: d.tierCap });
    const picks = d.vehicles[key] ?? {};
    const pages = Math.max(1, Math.ceil(avail.length / PAGE));
    state.page = Math.min(state.page ?? 0, pages - 1);
    const slice = avail.slice(state.page * PAGE, state.page * PAGE + PAGE);
    head
      .setColor(sideColor(ctx, key[0]))
      .setDescription(`**${teamText(ctx, d, key)}** • ${tierLabel(d.tierCap)}\nPick a vehicle, then enter how many to bring. You can never exceed what the school owns.`);
    const lines = avail.map((t) => `• ${t.display_name} \`T${t.tier}\` - available **${t.quantity}**${picks[t.tank_id] ? ` ➜ selected **×${picks[t.tank_id]}**` : ''}`);
    const chunks = chunkLines(lines.length ? lines : ['_This school has no usable vehicles for this tier limit._'], 1000);
    chunks.slice(0, 4).forEach((c, n) => head.addFields({ name: n ? 'Available (cont.)' : 'Available vehicles', value: c }));
    if (chunks.length > 4) head.addFields({ name: '…', value: 'More vehicles - use the menu and page buttons.' });
    if (blocked.length) head.addFields({ name: '🚫 Not available for this match', value: truncate(blocked.map((b) => `• ${b.tank.display_name} - ${b.reason}`).join('\n'), 1000) });
    const reqs = [...loadout.special_requirements, ...loadout.tanks.filter((t) => t.special_requirements && picks[t.tank_id]).map((t) => `${t.display_name}: ${t.special_requirements}`)];
    if (reqs.length) head.addFields({ name: '📌 Special requirements', value: truncate(reqs.map((r) => `• ${r}`).join('\n'), 1000) });
    const summary = keys.map((k) => {
      const p = d.vehicles[k] ?? {};
      const total = Object.values(p).reduce((a, b) => a + b, 0);
      return `${k === key ? '▶ ' : ''}${teamText(ctx, d, k)} - ${Object.keys(p).length} type(s), ${total} vehicle(s)`;
    });
    head.addFields({ name: 'Selection summary', value: truncate(summary.join('\n'), 1000) });

    const wStart = Math.floor(keys.indexOf(key) / PAGE) * PAGE;
    out.components.push(
      row(new StringSelectMenuBuilder().setCustomId(`wz:${sid}:team`).setPlaceholder('Switch school').addOptions(keys.slice(wStart, wStart + PAGE).map((k) => ({ label: truncate(teamLabel(ctx, d, k), 100), emoji: teamEmojiObj(ctx, d, k), value: k, default: k === key })))),
    );
    if (slice.length) {
      out.components.push(
        row(
          new StringSelectMenuBuilder()
            .setCustomId(`wz:${sid}:veh:${state.page}`)
            .setPlaceholder(`Choose a vehicle (page ${state.page + 1}/${pages})`)
            .addOptions(slice.map((t) => ({ label: truncate(`${t.display_name} (T${t.tier})`, 100), value: String(t.tank_id), description: truncate(`Available ${t.quantity}${picks[t.tank_id] ? ` • selected ×${picks[t.tank_id]}` : ''}`, 100) }))),
        ),
      );
    }
    const idxKey = keys.indexOf(key);
    out.components.push(
      row(
        btn(sid, `page:${state.page - 1}`, '◀ Vehicles', ButtonStyle.Secondary, state.page <= 0),
        btn(sid, `page:${state.page + 1}`, 'Vehicles ▶', ButtonStyle.Secondary, state.page >= pages - 1),
        btn(sid, 'clear', '🗑 Clear', ButtonStyle.Secondary, !Object.keys(picks).length),
        btn(sid, 'tprev', '⏮ School', ButtonStyle.Secondary, idxKey <= 0),
        btn(sid, 'tnext', 'School ⏭', ButtonStyle.Secondary, idxKey >= keys.length - 1),
      ),
    );
    out.components.push(nav(sid, state, [btn(sid, 'next', 'Continue ➡', ButtonStyle.Success)]));
    return out;
  }

  if (state.step === 'equipment') {
    const all = s.equipment.list({ includeDisabled: false }).filter((e) => !e.needs_review).slice(0, 25);
    const keys = teamKeys(d);
    if (!keys.includes(state.eqKey)) state.eqKey = keys[0];
    const key = state.eqKey;
    if (!state.equipInit) {
      s.matches.applyTeamEquipmentDefaults(d);
      state.equipInit = true;
    }
    const names = (ids) => truncate((ids ?? []).map((id) => `• ${s.equipment.get(id)?.name ?? `#${id}`}`).join('\n') || '_None_', 1000);
    head
      .setColor(sideColor(ctx, key[0]))
      .setDescription(
        '**All teams** get the basics below. On top of that every school gets **its own** equipment (taken from its loadout) - only that team receives it.\n`RemoveVehicle` is always included for everyone.',
      )
      .addFields(
        { name: '🧰 Equipment - ALL TEAMS', value: names(d.equipment) },
        { name: `${teamText(ctx, d, key)} - extra equipment for this team only`, value: names(d.teamEquipment[key]) },
      );
    out.components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`wz:${sid}:eqall`)
          .setPlaceholder('Equipment for ALL teams')
          .setMinValues(0)
          .setMaxValues(Math.max(1, all.length))
          .addOptions(all.map((e) => ({ label: truncate(e.name, 100), value: String(e.id), default: d.equipment.includes(e.id) }))),
      ),
    );
    out.components.push(
      row(new StringSelectMenuBuilder().setCustomId(`wz:${sid}:eqteam`).setPlaceholder('Choose the team to edit').addOptions(keys.slice(0, 25).map((k) => ({ label: truncate(teamLabel(ctx, d, k), 100), emoji: teamEmojiObj(ctx, d, k), value: k, default: k === key })))),
    );
    out.components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`wz:${sid}:eqone`)
          .setPlaceholder('Extra equipment for the team above')
          .setMinValues(0)
          .setMaxValues(Math.max(1, all.length))
          .addOptions(all.map((e) => ({ label: truncate(e.name, 100), value: String(e.id), default: (d.teamEquipment[key] ?? []).includes(e.id) }))),
      ),
    );
    out.components.push(nav(sid, state, [btn(sid, 'eqreset', '↺ Reset to school gear', ButtonStyle.Secondary), btn(sid, 'next', 'Continue ➡', ButtonStyle.Success)]));
    return out;
  }

  // review
  const v = s.matches.validate(d, { member: state.member });
  state.lastValidation = v;
  const h = s.matches.hydrate(d);
  out.embeds = ctx.embeds.match(h, { title: s.matches.titleRich(d), warnings: v.warnings.slice(0, 6) });
  out.embeds[0].setTitle(`⚔️ Match Wizard - Step ${steps.length}/${steps.length}: Review${d.id ? ` (${matchCode(d.id)})` : ''}`);
  if (v.errors.length) out.embeds.push(ctx.embeds.error(truncate(v.errors.join('\n\n'), 3800), '❌ Match cannot be finalized'));
  else out.embeds.push(ctx.embeds.success('Everything checks out. Finalizing freezes the loadout (status READY) and announces the match.', '✅ Validation passed'));
  out.components.push(
    row(
      btn(sid, 'save', '💾 Save draft', ButtonStyle.Secondary),
      btn(sid, 'json', '📄 Generate JSON', ButtonStyle.Primary, v.errors.length > 0),
      btn(sid, 'finalize', '✅ Finalize match', ButtonStyle.Success, v.errors.length > 0),
    ),
  );
  out.components.push(nav(sid, state));
  return out;
}

// ------------------------------------------------------------------ entry points
function assertReferee(ctx, i) {
  if (!ctx.services.permissions.isReferee(i.member)) throw new ValidationError('You need the TI Referee role to create matches.');
}

async function start(ctx, i) {
  assertReferee(ctx, i);
  const draft = ctx.services.matches.newDraft(i.user.id, 1, 1);
  const state = { step: 'format', draft, page: 0, member: i.member };
  const sid = createSession(i.user.id, state);
  return updateOrReply(i, render(ctx, sid, state));
}

async function startEdit(ctx, i, draft) {
  assertReferee(ctx, i);
  const state = { step: 'review', draft, page: 0, equipInit: true, member: i.member };
  const sid = createSession(i.user.id, state);
  return updateOrReply(i, render(ctx, sid, state));
}

// ------------------------------------------------------------------ interaction handling
function resetSides(ctx, state, h, e) {
  const keep = ctx.services.settings.getBaseEquipmentIds();
  Object.assign(state.draft, { hawkCount: h, eagleCount: e, hawk: [], eagle: [], vehicles: {}, equipment: keep, teamEquipment: {} });
  state.equipInit = false;
}

function go(state, step) {
  state.step = step;
  state.page = 0;
}

/** Re-apply tier limit / full-loadout choice to the picks. */
function syncPicks(ctx, state) {
  const m = ctx.services.matches;
  if (state.draft.fullLoadout) m.applyFullLoadout(state.draft);
  else m.pruneToTier(state.draft);
}

async function handle(ctx, i, parts) {
  const [, sid, action, ...args] = parts;
  const sess = getSession(sid, i.user.id);
  const { state } = sess;
  state.member = i.member;
  assertReferee(ctx, i);
  const s = ctx.services;
  const d = state.draft;
  const done = () => updateOrReply(i, render(ctx, sid, state));
  const ids = () => i.values.map(Number).filter((n) => Number.isInteger(n));

  switch (action) {
    case 'fmt': {
      const v = i.values[0];
      if (v === 'custom') {
        const max = ctx.config.matches.maxTeams;
        return i.showModal(
          new ModalBuilder()
            .setCustomId(`wz:${sid}:custom`)
            .setTitle('Custom format')
            .addComponents(
              row(new TextInputBuilder().setCustomId('h').setLabel(`Schools for Hawk Republic (1–${max})`).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)),
              row(new TextInputBuilder().setCustomId('e').setLabel(`Schools for Eagle Federation (1–${max})`).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)),
            ),
        );
      }
      const n = Number(v);
      s.matches.validateTeamCounts(n, n);
      resetSides(ctx, state, n, n);
      go(state, 'hawk');
      return done();
    }
    case 'custom': {
      const max = ctx.config.matches.maxTeams;
      const h = parseQuantity(i.fields.getTextInputValue('h'), { min: 1, max });
      const e = parseQuantity(i.fields.getTextInputValue('e'), { min: 1, max });
      s.matches.validateTeamCounts(h, e);
      resetSides(ctx, state, h, e);
      go(state, 'hawk');
      return done();
    }
    case 'sch': {
      const side = state.step === 'hawk' ? 'H' : 'E';
      const need = side === 'H' ? d.hawkCount : d.eagleCount;
      const page = Number(args[0]) || 0;
      const cand = candidates(ctx, state, side);
      const onPage = new Set(cand.slice(page * PAGE, page * PAGE + PAGE).map((x) => x.id));
      const key = listKey(side);
      const next = [...d[key].filter((id) => !onPage.has(id)), ...ids().filter((id) => onPage.has(id))];
      if (next.length > need) state.notice = `${SIDES[side].name} only has ${need} slot${need === 1 ? '' : 's'} - deselect a school first.`;
      else {
        d[key] = next;
        for (const k of Object.keys(d.vehicles)) if (k[0] === side) delete d.vehicles[k];
        state.equipInit = false;
      }
      return done();
    }
    case 'page':
      state.page = Math.max(0, Number(args[0]) || 0);
      return done();
    case 'tier': {
      const choice = TIER_CHOICES.find((t) => t.value === i.values[0]);
      if (!choice) throw new ValidationError('Unknown tier limit.');
      d.tierCap = choice.cap;
      syncPicks(ctx, state);
      return done();
    }
    case 'full':
      d.fullLoadout = !d.fullLoadout;
      if (d.fullLoadout) s.matches.applyFullLoadout(d);
      return done();
    case 'sched': {
      const tz = s.settings.getUserTimezone(i.user.id) ?? d.timezone ?? '';
      const field = (cid, label, ph, value) => {
        const t = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(ph);
        if (value) t.setValue(value);
        return row(t);
      };
      return i.showModal(
        new ModalBuilder()
          .setCustomId(`wz:${sid}:schedmodal`)
          .setTitle('Match date & time')
          .addComponents(
            field('date', 'Date (YYYY-MM-DD)', '2026-10-18'),
            field('time', 'Time (24h 19:30 or 7:30 PM)', '19:30'),
            field('tz', 'Timezone you are typing it in', 'America/Vancouver, EST, UTC+2 ...', tz),
          ),
      );
    }
    case 'schedmodal': {
      const tzText = i.fields.getTextInputValue('tz');
      const { epoch, zoneLabel } = parseSchedule({ date: i.fields.getTextInputValue('date'), time: i.fields.getTextInputValue('time'), timezone: tzText });
      d.scheduledAt = epoch;
      d.timezone = zoneLabel;
      s.settings.setUserTimezone(i.user.id, tzText);
      return done();
    }
    case 'unsched':
      d.scheduledAt = null;
      d.timezone = null;
      return done();
    case 'team':
      state.tankKey = i.values[0];
      state.page = 0;
      return done();
    case 'tprev':
    case 'tnext': {
      const keys = teamKeys(d);
      const idx = keys.indexOf(state.tankKey) + (action === 'tnext' ? 1 : -1);
      state.tankKey = keys[Math.min(Math.max(idx, 0), keys.length - 1)];
      state.page = 0;
      return done();
    }
    case 'veh': {
      const tankId = Number(i.values[0]);
      const school = s.schools.get(MatchService.schoolForKey(d, state.tankKey));
      const entry = s.loadouts.availableForMatch(school.id, { tierCap: d.tierCap }).find((t) => t.tank_id === tankId);
      if (!entry) throw new ValidationError("That vehicle can't be brought to this match (not owned, not an MTC vehicle, or above the tier limit).");
      const cur = d.vehicles[state.tankKey]?.[tankId] ?? '';
      return i.showModal(
        new ModalBuilder()
          .setCustomId(`wz:${sid}:qty:${tankId}`)
          .setTitle(truncate(`Quantity - ${entry.display_name}`, 45))
          .addComponents(
            row(new TextInputBuilder().setCustomId('qty').setLabel(truncate(`How many? (0–${entry.quantity}, 0 removes)`, 45)).setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true).setValue(String(cur || 1))),
          ),
      );
    }
    case 'qty': {
      const tankId = Number(args[0]);
      const school = s.schools.get(MatchService.schoolForKey(d, state.tankKey));
      const entry = s.loadouts.availableForMatch(school.id, { tierCap: d.tierCap }).find((t) => t.tank_id === tankId);
      if (!entry) throw new ValidationError("That vehicle can't be brought to this match.");
      const raw = i.fields.getTextInputValue('qty').trim();
      if (!/^\d+$/.test(raw)) throw new ValidationError('Quantity must be a whole number.');
      const q = Number(raw);
      if (q > entry.quantity) throw new ValidationError(`❌ ${school.name} only has ${entry.quantity} ${entry.display_name} available.\n\nRequested:\n${q}\n\nAvailable:\n${entry.quantity}`);
      const picks = (d.vehicles[state.tankKey] ??= {});
      if (q === 0) delete picks[tankId];
      else picks[tankId] = q;
      return done();
    }
    case 'clear':
      delete d.vehicles[state.tankKey];
      return done();
    case 'eqall':
      d.equipment = ids();
      return done();
    case 'eqteam':
      state.eqKey = i.values[0];
      return done();
    case 'eqone':
      (d.teamEquipment ??= {})[state.eqKey] = ids();
      return done();
    case 'eqreset':
      s.matches.applyTeamEquipmentDefaults(d);
      d.equipment = s.settings.getBaseEquipmentIds();
      return done();
    case 'next': {
      if (state.step === 'hawk' || state.step === 'eagle') {
        const side = state.step === 'hawk' ? 'H' : 'E';
        const need = side === 'H' ? d.hawkCount : d.eagleCount;
        if (d[listKey(side)].length !== need) {
          state.notice = `Select exactly ${need} school(s) for ${SIDES[side].name}.`;
          return done();
        }
      }
      if (state.step === 'rules') syncPicks(ctx, state);
      const steps = stepsOf(state);
      const nextStep = steps[steps.indexOf(state.step) + 1];
      go(state, nextStep);
      if (nextStep === 'tanks') state.tankKey = teamKeys(d)[0];
      if (nextStep === 'equipment') state.eqKey = teamKeys(d)[0];
      return done();
    }
    case 'back': {
      const steps = stepsOf(state);
      go(state, steps[Math.max(0, steps.indexOf(state.step) - 1)]);
      return done();
    }
    case 'save': {
      const saved = s.matches.save(d, actorOf(i));
      state.draft = saved;
      state.notice = `Draft saved as ${matchCode(saved.id)}.`;
      return done();
    }
    case 'json': {
      const v = s.matches.validate(d, { member: i.member });
      if (v.errors.length) throw new ValidationError('Fix the validation errors first.');
      const text = s.mtc.serialize(s.matches.buildLoadout(d));
      return reply(i, eph({ content: '📄 Generated MTC loadout (preview - finalize to freeze it):', files: [jsonFile(`${d.id ? matchCode(d.id) : 'match-preview'}.json`, text)] }));
    }
    case 'finalize': {
      const saved = s.matches.save(d, actorOf(i));
      state.draft = saved;
      await i.deferUpdate();
      const payload = await require('./matchUI').finalizeAndPost(ctx, i, saved.id);
      sessions.delete(sid);
      return updateOrReply(i, payload);
    }
    case 'cancel':
      sessions.delete(sid);
      return updateOrReply(i, { content: '', embeds: [ctx.embeds.info('Wizard closed. Any draft you already saved is still available under `/match list`.', '✖ Wizard closed')], components: [] });
    default:
      throw new ValidationError('Unknown wizard action.');
  }
}

module.exports = { start, startEdit, handle, render, sessions };
