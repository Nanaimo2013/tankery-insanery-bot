/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { Events } = require('discord.js');
const { RateLimiter } = require('../utils/permissions');
const { getLogger } = require('../utils/logger');
const { eph, friendlyError } = require('../ui/common');
const { ValidationError } = require('../utils/validators');

const limiter = new RateLimiter({ max: 8, windowMs: 10_000 });

function actionOf(i) {
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand(false);
  return [i.commandName, group, sub].filter(Boolean).join('.');
}

async function route(ctx, i) {
  const { permissions } = ctx.services;
  const log = getLogger();

  // Down for maintenance (switched from the server console): every command and button just says so.
  if (ctx.services.maintenance.isEnabled()) {
    if (i.isAutocomplete()) return i.respond([]);
    return i.reply(eph({ embeds: [ctx.embeds.maintenance(ctx.services.maintenance.status())], components: [], content: '' }));
  }

  // Guild + rate-limit checks apply to every interaction type.
  if (!i.inGuild() || !permissions.isCorrectGuild(i.guildId)) {
    if (i.isAutocomplete()) return i.respond([]);
    return i.reply(eph({ embeds: [ctx.embeds.error('This bot only works inside the Tankery Insanery server.')] }));
  }
  const wait = limiter.check(i.user.id);
  if (wait) {
    if (i.isAutocomplete()) return i.respond([]);
    return i.reply(eph({ embeds: [ctx.embeds.warning(`Slow down - try again in ${Math.ceil(wait / 1000)}s.`)] }));
  }

  if (i.isAutocomplete()) {
    const cmd = ctx.commands.get(i.commandName);
    if (!cmd?.autocomplete || !permissions.can(i.member, actionOf(i))) return i.respond([]);
    return cmd.autocomplete(ctx, i);
  }

  if (i.isChatInputCommand()) {
    const cmd = ctx.commands.get(i.commandName);
    if (!cmd) throw new ValidationError('Unknown command.');
    const action = actionOf(i);
    if (!permissions.can(i.member, action)) {
      const need = permissions.requiredLevel(action) >= 2 ? 'TI Admin' : 'TI Referee';
      log.warn({ user: i.user.id, action }, 'Permission denied');
      throw new ValidationError(`You need the **${need}** role to use \`/${action.replace(/\./g, ' ')}\`.`);
    }
    log.info({ user: i.user.id, action }, 'Command');
    return cmd.execute(ctx, i);
  }

  if (i.isMessageComponent() || i.isModalSubmit()) {
    const parts = i.customId.split(':');
    switch (parts[0]) {
      case 'ls':
        return require('../ui/lists').handle(ctx, i, parts);
      case 'mt':
        return require('../ui/matchUI').handle(ctx, i, parts);
      case 'wz':
        return require('../ui/wizard').handle(ctx, i, parts);
      case 'pn':
        return require('../ui/panels').handle(ctx, i, parts);
      default:
        throw new ValidationError('This control is no longer active.');
    }
  }
  return undefined;
}

module.exports = {
  name: Events.InteractionCreate,
  once: false,
  async execute(ctx, i) {
    try {
      await route(ctx, i);
    } catch (err) {
      if (i.isAutocomplete?.()) {
        getLogger().warn({ err }, 'Autocomplete failed');
        return i.respond([]).catch(() => {});
      }
      return friendlyError(ctx, i, err);
    }
    return undefined;
  },
};
