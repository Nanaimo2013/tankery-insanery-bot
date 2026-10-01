/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { ValidationError } = require('../../utils/validators');
const { matchCode } = require('../../utils/formatters');
const { parseSchedule, discordWhen } = require('../../utils/time');
const { STATUS } = require('../../../config/matches');
const { eph, reply, actorOf, matchOpt, addMatch, autocomplete: auto } = require('../../ui/common');
const lists = require('../../ui/lists');
const matchUI = require('../../ui/matchUI');
const panels = require('../../ui/panels');
const wizard = require('../../ui/wizard');

const data = new SlashCommandBuilder()
  .setName('match')
  .setDescription('Create and run Tankery Insanery matches (TI Referee)')
  .setDMPermission(false)
  .addSubcommand((s) => s.setName('create').setDescription('Start the interactive match wizard'))
  .addSubcommand((s) => s.setName('panel').setDescription('Open the referee panel'))
  .addSubcommand((s) => addMatch(s.setName('view').setDescription('Open a match (private panel with your controls)')))
  .addSubcommand((s) =>
    s.setName('list').setDescription('List matches').addStringOption((o) => o.setName('scope').setDescription('Which matches').addChoices({ name: 'My matches', value: 'mine' }, { name: 'All matches', value: 'all' })),
  )
  .addSubcommand((s) => s.setName('history').setDescription('Completed and cancelled matches'))
  .addSubcommand((s) => addMatch(s.setName('edit').setDescription('Edit a DRAFT match in the wizard')))
  .addSubcommand((s) => addMatch(s.setName('finalize').setDescription('Validate, freeze and announce a DRAFT match (status READY)')))
  .addSubcommand((s) => addMatch(s.setName('start').setDescription('Start a READY match')))
  .addSubcommand((s) => addMatch(s.setName('finish').setDescription('Finish a running match - the side with more round wins is the winner')))
  .addSubcommand((s) => addMatch(s.setName('cancel').setDescription('Cancel a match')))
  .addSubcommand((s) =>
    addMatch(s.setName('rounds').setDescription('Record round wins (Hawk Republic vs Eagle Federation)'))
      .addIntegerOption((o) => o.setName('hawk').setDescription('Round wins for the Hawk Republic school(s)').setMinValue(0).setMaxValue(99))
      .addIntegerOption((o) => o.setName('eagle').setDescription('Round wins for the Eagle Federation school(s)').setMinValue(0).setMaxValue(99)),
  )
  .addSubcommand((s) =>
    addMatch(s.setName('schedule').setDescription('Set the match date & time (shown to everyone in their own timezone)'))
      .addStringOption((o) => o.setName('date').setDescription('Date, e.g. 2026-10-18 (leave everything empty with clear=true to remove)').setMaxLength(10))
      .addStringOption((o) => o.setName('time').setDescription('Time, e.g. 19:30 or 7:30 PM').setMaxLength(8))
      .addStringOption((o) => o.setName('timezone').setDescription('Timezone you typed it in, e.g. America/Vancouver, EST, CET, UTC+2 (remembered for next time)').setMaxLength(40))
      .addBooleanOption((o) => o.setName('clear').setDescription('Remove the scheduled time')),
  )
  .addSubcommand((s) => addMatch(s.setName('referee').setDescription('Change the referee of a match')).addUserOption((o) => o.setName('user').setDescription('New referee (needs the TI Referee role)').setRequired(true)))
  .addSubcommand((s) => addMatch(s.setName('export').setDescription('Export the MTC JSON of a match')))
  .addSubcommand((s) => addMatch(s.setName('reopen').setDescription('Re-open a finalized/cancelled match for editing (TI Admin)')));

async function execute(ctx, i) {
  const sub = i.options.getSubcommand();
  const s = ctx.services;
  const actor = actorOf(i);
  const done = async (id, text) => {
    await matchUI.refreshAnnouncement(ctx, id);
    return reply(i, eph({ embeds: [ctx.embeds.success(text)] }));
  };
  switch (sub) {
    case 'create':
      return wizard.start(ctx, i);
    case 'panel':
      return reply(i, eph(panels.refereePanel(ctx)));
    case 'view': {
      const m = matchOpt(ctx, i);
      return reply(i, eph(matchUI.viewPayload(ctx, m.id, i.member, i.user.id)));
    }
    case 'list':
      return reply(i, eph(lists.render(ctx, 'match', 0, i.options.getString('scope') ?? 'mine', i.user)));
    case 'history':
      return reply(i, eph(lists.render(ctx, 'match', 0, 'hist', i.user)));
    case 'edit': {
      const m = matchOpt(ctx, i);
      if (!s.permissions.canManageMatch(i.member, i.user.id, { referee_id: m.refereeId })) throw new ValidationError('You can only edit matches you created.');
      if (m.status !== STATUS.DRAFT) throw new ValidationError(`${matchCode(m.id)} is ${m.status}. Ask a TI Admin to re-open it before editing.`);
      return wizard.startEdit(ctx, i, m);
    }
    case 'finalize': {
      const m = matchOpt(ctx, i);
      await i.deferReply({ flags: 64 });
      return reply(i, await matchUI.finalizeAndPost(ctx, i, m.id));
    }
    case 'start': {
      const m = matchOpt(ctx, i);
      s.matches.start(m.id, actor);
      return done(m.id, `${matchCode(m.id)} is now **in progress**. Record round wins with \`/match rounds\`.`);
    }
    case 'finish': {
      const m = matchOpt(ctx, i);
      const after = s.matches.complete(m.id, actor);
      return done(m.id, `${matchCode(m.id)} finished. ${s.matches.result(after).text}`);
    }
    case 'cancel': {
      const m = matchOpt(ctx, i);
      s.matches.cancel(m.id, actor);
      return done(m.id, `${matchCode(m.id)} has been cancelled.`);
    }
    case 'reopen': {
      const m = matchOpt(ctx, i);
      s.matches.reopen(m.id, actor);
      return done(m.id, `${matchCode(m.id)} is a draft again (round wins were reset). Edit it with \`/match edit\`.`);
    }
    case 'rounds': {
      const m = matchOpt(ctx, i);
      const hawk = i.options.getInteger('hawk');
      const eagle = i.options.getInteger('eagle');
      if (hawk === null && eagle === null) throw new ValidationError('Give the round wins for at least one side (hawk and/or eagle).');
      const after = s.matches.setRounds(m.id, { hawk: hawk ?? undefined, eagle: eagle ?? undefined }, actor);
      return done(m.id, `Round wins for ${matchCode(m.id)}: **${s.matches.result(after).text}**`);
    }
    case 'schedule': {
      const m = matchOpt(ctx, i);
      if (i.options.getBoolean('clear')) {
        s.matches.setSchedule(m.id, { epoch: null }, actor);
        return done(m.id, `Cleared the time of ${matchCode(m.id)}.`);
      }
      const date = i.options.getString('date');
      const time = i.options.getString('time');
      if (!date || !time) throw new ValidationError('Give both a date and a time (or use clear=true).');
      const tz = i.options.getString('timezone') ?? s.settings.getUserTimezone(i.user.id);
      if (!tz) throw new ValidationError('Add a timezone too (e.g. America/Vancouver, EST, UTC+2) - it is remembered for next time.');
      const { epoch } = parseSchedule({ date, time, timezone: tz });
      await matchUI.applySchedule(ctx, i, m.id, { date, time, timezone: tz });
      return reply(i, eph({ embeds: [ctx.embeds.success(`${matchCode(m.id)} is scheduled for\n${discordWhen(epoch)}`)] }));
    }
    case 'referee': {
      const m = matchOpt(ctx, i);
      const user = i.options.getUser('user', true);
      const target = await i.guild.members.fetch(user.id).catch(() => null);
      if (!target) throw new ValidationError('That user is not in this server.');
      s.matches.changeReferee(m.id, user.id, actor, { targetMember: target });
      return done(m.id, `<@${user.id}> is now the referee of ${matchCode(m.id)}.`);
    }
    case 'export': {
      const m = matchOpt(ctx, i);
      return matchUI.sendExport(ctx, i, m.id);
    }
    default:
      throw new ValidationError('Unknown subcommand.');
  }
}

module.exports = { data, execute, autocomplete: auto };
