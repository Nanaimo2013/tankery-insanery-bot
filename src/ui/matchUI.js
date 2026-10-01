/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
} = require('discord.js');
const { ValidationError, parseQuantity } = require('../utils/validators');
const { matchCode, truncate } = require('../utils/formatters');
const { parseSchedule } = require('../utils/time');
const { getLogger } = require('../utils/logger');
const { STATUS, SIDES } = require('../../config/matches');
const { eph, actorOf, reply, updateOrReply, jsonFile } = require('./common');

const btn = (id, label, style = ButtonStyle.Secondary, disabled = false) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
const row = (...c) => new ActionRowBuilder().addComponents(...c);
const noMentions = { parse: [] };

// ---------------------------------------------------------------------------------------------
// Public announcement (match channel). It carries NO buttons: only the referee's private panel
// (/match panel) can start, cancel, score or edit a match. The message is edited in place whenever
// the match changes.
// ---------------------------------------------------------------------------------------------
function announceEmbeds(ctx, id) {
  const s = ctx.services;
  const d = s.matches.load(id);
  return ctx.embeds.match(s.matches.hydrate(d), { title: s.matches.titleRich(d), result: s.matches.result(d, { rich: true }) });
}

async function channelFor(ctx, id) {
  if (!id) return null;
  const ch = await ctx.client?.channels.fetch(id).catch(() => null);
  return ch?.isTextBased?.() ? ch : null;
}

async function fetchMessage(ctx, channelId, messageId) {
  const ch = await channelFor(ctx, channelId);
  if (!ch || !messageId) return null;
  return ch.messages.fetch(messageId).catch(() => null);
}

/** Post (or re-post) the announcement and the MTC JSON for a finalized match. */
async function postFinalized(ctx, matchId) {
  const s = ctx.services;
  const d = s.matches.load(matchId);
  const code = matchCode(matchId);
  const result = { match: null, loadout: null };
  try {
    const mc = await channelFor(ctx, ctx.config.channels.match);
    if (mc) {
      const msg = await mc.send({ embeds: announceEmbeds(ctx, matchId), allowedMentions: noMentions });
      s.matches.setAnnouncement(matchId, { channelId: mc.id, messageId: msg.id });
      result.match = msg.url;
    }
    const lc = await channelFor(ctx, ctx.config.channels.loadout);
    if (lc) {
      const msg = await lc.send({ content: `📦 MTC loadout for **${code}** - ${s.matches.titleRich(d)}`, files: [jsonFile(`${code}.json`, s.matches.exportJson(matchId))], allowedMentions: noMentions });
      s.matches.setLoadoutMessage(matchId, { channelId: lc.id, messageId: msg.id });
      result.loadout = msg.url;
    }
  } catch (err) {
    getLogger().warn({ err }, 'Failed to post match to channel');
    result.error = "Could not post to the configured channel(s) - check the bot's permissions there.";
  }
  return result;
}

/**
 * Bring the posted announcement up to date after ANY change (start, finish, cancel, round wins,
 * time, referee, re-open ...). Edits the existing message; re-posts only if it was deleted.
 */
async function refreshAnnouncement(ctx, matchId) {
  const s = ctx.services;
  const d = s.matches.load(matchId);
  if (!d?.announceMessageId) return;
  try {
    const msg = await fetchMessage(ctx, d.announceChannelId, d.announceMessageId);
    if (msg) await msg.edit({ embeds: announceEmbeds(ctx, matchId), components: [], allowedMentions: noMentions });
    else if ([STATUS.READY, STATUS.ACTIVE, STATUS.COMPLETED].includes(d.status)) {
      const ch = await channelFor(ctx, d.announceChannelId);
      if (ch) {
        const fresh = await ch.send({ embeds: announceEmbeds(ctx, matchId), allowedMentions: noMentions });
        s.matches.setAnnouncement(matchId, { channelId: ch.id, messageId: fresh.id });
      }
    }
    // A re-opened match no longer has a valid loadout - remove the stale JSON post.
    if (d.status === STATUS.DRAFT && d.loadoutMessageId) {
      const lm = await fetchMessage(ctx, d.loadoutChannelId, d.loadoutMessageId);
      await lm?.delete().catch(() => {});
      s.matches.setLoadoutMessage(matchId, { channelId: null, messageId: null });
    }
  } catch (err) {
    getLogger().warn({ err, matchId }, 'Could not refresh the match announcement');
  }
}

// ---------------------------------------------------------------------------------------------
// Private referee panel (ephemeral)
// ---------------------------------------------------------------------------------------------
/** Embeds + management buttons for one match, tailored to what `member` is allowed to do. */
function viewPayload(ctx, id, member, userId) {
  const s = ctx.services;
  const d = s.matches.load(id);
  if (!d) throw new ValidationError('That match no longer exists.');
  const h = s.matches.hydrate(d);
  const embeds = ctx.embeds.match(h, { title: s.matches.titleRich(d), result: s.matches.result(d, { rich: true }) });
  if (d.status === STATUS.DRAFT) {
    const v = s.matches.validate(d);
    if (v.errors.length) embeds.push(ctx.embeds.warning(v.errors.join('\n\n').slice(0, 3800), '⚠️ Not ready to finalize'));
  }
  const manage = s.permissions.canManageMatch(member, userId, { id: d.id, referee_id: d.refereeId });
  const admin = s.permissions.isAdmin(member);
  const canExport = s.permissions.canExportMatch(member);
  const components = [];

  if (manage) {
    const life = [];
    if (d.status === STATUS.DRAFT) life.push(btn(`mt:edit:${id}`, '✏️ Edit', ButtonStyle.Primary), btn(`mt:finalize:${id}`, '✅ Finalize', ButtonStyle.Success));
    if (d.status === STATUS.READY) life.push(btn(`mt:start:${id}`, '🔥 Start', ButtonStyle.Success));
    if (d.status === STATUS.ACTIVE) life.push(btn(`mt:finish:${id}`, '🏁 Finish match', ButtonStyle.Success));
    if ([STATUS.DRAFT, STATUS.READY, STATUS.ACTIVE].includes(d.status)) life.push(btn(`mt:cancel:${id}`, '🚫 Cancel', ButtonStyle.Danger));
    if (life.length) components.push(row(...life));

    if ([STATUS.ACTIVE, STATUS.COMPLETED].includes(d.status)) {
      components.push(
        row(
          btn(`mt:rh+:${id}`, 'Hawk +1', ButtonStyle.Secondary).setEmoji(SIDES.H.emojiObj),
          btn(`mt:rh-:${id}`, 'Hawk −1', ButtonStyle.Secondary, h.hawkWins < 1),
          btn(`mt:re+:${id}`, 'Eagle +1', ButtonStyle.Secondary).setEmoji(SIDES.E.emojiObj),
          btn(`mt:re-:${id}`, 'Eagle −1', ButtonStyle.Secondary, h.eagleWins < 1),
          btn(`mt:score:${id}`, '✍️ Set score', ButtonStyle.Primary),
        ),
      );
    }
    const misc = [];
    if ([STATUS.DRAFT, STATUS.READY, STATUS.ACTIVE].includes(d.status)) misc.push(btn(`mt:sched:${id}`, '📅 Set time'));
    if (![STATUS.COMPLETED, STATUS.CANCELLED].includes(d.status)) misc.push(btn(`mt:refbtn:${id}`, '👤 Change referee'));
    if (admin && [STATUS.READY, STATUS.ACTIVE, STATUS.CANCELLED].includes(d.status)) misc.push(btn(`mt:reopen:${id}`, '🔓 Re-open'));
    if (misc.length) components.push(row(...misc));
  }
  if (canExport) components.push(row(btn(`mt:copy:${id}`, '📋 Copy JSON'), btn(`mt:export:${id}`, '📥 Export JSON')));
  return { embeds: embeds.slice(0, 10), components, content: '' };
}

async function sendExport(ctx, i, id) {
  const s = ctx.services;
  if (!s.permissions.canExportMatch(i.member)) throw new ValidationError('You do not have permission to export loadouts.');
  if (!s.matches.getRow(id)) throw new ValidationError('That match does not exist.');
  const json = s.matches.exportJson(id);
  return reply(i, eph({ content: `📥 MTC loadout for **${matchCode(id)}**`, files: [jsonFile(`${matchCode(id)}.json`, json)] }));
}

async function sendCopy(ctx, i, id) {
  const s = ctx.services;
  if (!s.permissions.canExportMatch(i.member)) throw new ValidationError('You do not have permission to export loadouts.');
  if (!s.matches.getRow(id)) throw new ValidationError('That match does not exist.');
  const json = s.matches.exportJson(id);
  const block = `\`\`\`json\n${json}\n\`\`\``;
  if (block.length <= 1950) return reply(i, eph({ content: block }));
  return reply(i, eph({ content: 'ℹ️ Too long for a chat message - here it is as a file (open it and copy).', files: [jsonFile(`${matchCode(id)}.json`, json)] }));
}

/** Finalize a draft and announce it. Returns the panel payload for the finalized match. */
async function finalizeAndPost(ctx, i, id) {
  const s = ctx.services;
  s.matches.finalize(id, actorOf(i));
  const posted = await postFinalized(ctx, id);
  const view = viewPayload(ctx, id, i.member, i.user.id);
  const notes = [];
  if (posted.match) notes.push(`📣 Announced: ${posted.match}`);
  if (posted.loadout) notes.push(`📦 Loadout posted: ${posted.loadout}`);
  if (posted.error) notes.push(`⚠️ ${posted.error}`);
  view.content = ['✅ **Match finalized - status READY.**', ...notes].join('\n');
  return view;
}

// ---------------------------------------------------------------------------------------------
// Shared modals / helpers (also used by slash commands)
// ---------------------------------------------------------------------------------------------
/** Apply a time from date/time/timezone text, remember the timezone for next time and refresh the post. */
async function applySchedule(ctx, i, id, { date, time, timezone }) {
  const s = ctx.services;
  const { epoch, zoneLabel } = parseSchedule({ date, time, timezone });
  s.matches.setSchedule(id, { epoch, zoneLabel }, actorOf(i));
  s.settings.setUserTimezone(i.user.id, timezone);
  await refreshAnnouncement(ctx, id);
  return epoch;
}

function scheduleModal(ctx, id, userId) {
  const tz = ctx.services.settings.getUserTimezone(userId) ?? '';
  const input = (cid, label, ph, value) => {
    const t = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(ph);
    if (value) t.setValue(value);
    return row(t);
  };
  return new ModalBuilder()
    .setCustomId(`mt:schedmodal:${id}`)
    .setTitle('Match date & time')
    .addComponents(
      input('date', 'Date (YYYY-MM-DD)', '2026-10-18'),
      input('time', 'Time (24h 19:30 or 7:30 PM)', '19:30'),
      input('tz', 'Timezone you are typing it in', 'America/Vancouver, EST, UTC+2 ...', tz),
    );
}

function scoreModal(ctx, id) {
  const s = ctx.services;
  const d = s.matches.load(id);
  const num = (cid, label, value) =>
    row(new TextInputBuilder().setCustomId(cid).setLabel(truncate(label, 45)).setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true).setValue(String(value)));
  return new ModalBuilder()
    .setCustomId(`mt:scoremodal:${id}`)
    .setTitle('Round wins')
    .addComponents(
      num('hawk', `${truncate(s.matches.schoolNames(d, 'H'), 28)} (Hawk)`, d.hawkWins),
      num('eagle', `${truncate(s.matches.schoolNames(d, 'E'), 27)} (Eagle)`, d.eagleWins),
    );
}

/** Handle `mt:*` buttons, modals and the select menus of the referee panel. */
async function handle(ctx, i, parts) {
  const s = ctx.services;
  const action = parts[1];
  const id = Number(i.isStringSelectMenu?.() && action === 'open' ? i.values[0] : parts[2]);
  if (!Number.isInteger(id)) throw new ValidationError('Unknown match.');
  const actor = actorOf(i);
  if (!s.permissions.isReferee(i.member)) throw new ValidationError('You need the TI Referee role to do that.');

  const panel = () => viewPayload(ctx, id, i.member, i.user.id);
  /** Run a change, refresh the public post, then redraw the private panel. */
  const mutate = async (fn) => {
    fn();
    await refreshAnnouncement(ctx, id);
    return updateOrReply(i, panel());
  };

  switch (action) {
    case 'export':
      return sendExport(ctx, i, id);
    case 'copy':
      return sendCopy(ctx, i, id);
    case 'open':
      return updateOrReply(i, panel());
    case 'edit': {
      const d = s.matches.load(id);
      if (!d) throw new ValidationError('That match does not exist.');
      if (!s.permissions.canManageMatch(i.member, i.user.id, { referee_id: d.refereeId })) throw new ValidationError('You can only edit matches you created.');
      if (d.status !== STATUS.DRAFT) throw new ValidationError(`${matchCode(id)} is ${d.status}. Ask a TI Admin to re-open it before editing.`);
      return require('./wizard').startEdit(ctx, i, d);
    }
    case 'finalize':
      await i.deferUpdate();
      return updateOrReply(i, await finalizeAndPost(ctx, i, id));
    case 'cancel':
      return mutate(() => s.matches.cancel(id, actor));
    case 'start':
      return mutate(() => s.matches.start(id, actor));
    case 'finish':
      return mutate(() => s.matches.complete(id, actor));
    case 'reopen':
      return mutate(() => s.matches.reopen(id, actor));
    case 'rh+':
    case 'rh-':
    case 're+':
    case 're-': {
      const side = action[1] === 'h' ? 'H' : 'E';
      return mutate(() => s.matches.adjustRound(id, side, action[2] === '+' ? 1 : -1, actor));
    }
    case 'score':
      return i.showModal(scoreModal(ctx, id));
    case 'scoremodal': {
      const hawk = parseQuantity(i.fields.getTextInputValue('hawk'), { min: 0, max: 99 });
      const eagle = parseQuantity(i.fields.getTextInputValue('eagle'), { min: 0, max: 99 });
      return mutate(() => s.matches.setRounds(id, { hawk, eagle }, actor));
    }
    case 'sched':
      return i.showModal(scheduleModal(ctx, id, i.user.id));
    case 'schedmodal': {
      await applySchedule(ctx, i, id, { date: i.fields.getTextInputValue('date'), time: i.fields.getTextInputValue('time'), timezone: i.fields.getTextInputValue('tz') });
      return updateOrReply(i, panel());
    }
    case 'refbtn': {
      const d = s.matches.load(id);
      s.matches.assertCanManage(s.matches.getRow(id), actor);
      return reply(i, eph({
        content: `👤 Pick the new referee for **${matchCode(id)}** (currently <@${d.refereeId}>). They need the TI Referee role.`,
        components: [row(new UserSelectMenuBuilder().setCustomId(`mt:refsel:${id}`).setPlaceholder('Choose the new referee').setMinValues(1).setMaxValues(1))],
        allowedMentions: noMentions,
      }));
    }
    case 'refsel': {
      const userId = i.values[0];
      const target = i.members?.get?.(userId) ?? (await i.guild.members.fetch(userId).catch(() => null));
      if (!target) throw new ValidationError('That user is not in this server.');
      s.matches.changeReferee(id, userId, actor, { targetMember: target });
      await refreshAnnouncement(ctx, id);
      return updateOrReply(i, { content: `✅ <@${userId}> is now the referee of **${matchCode(id)}**.`, components: [], embeds: [], allowedMentions: noMentions });
    }
    default:
      throw new ValidationError('Unknown match action.');
  }
}

module.exports = { viewPayload, handle, postFinalized, refreshAnnouncement, finalizeAndPost, applySchedule, sendExport };
