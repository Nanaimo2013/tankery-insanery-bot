/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const crypto = require('node:crypto');
const { AttachmentBuilder, MessageFlags } = require('discord.js');
const { ValidationError } = require('../utils/validators');
const { truncate } = require('../utils/formatters');
const { getLogger } = require('../utils/logger');

const eph = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });

const actorOf = (i) => ({ id: i.user.id, tag: i.user.tag ?? i.user.username, member: i.member });
const auditActor = (i) => ({ id: i.user.id, tag: i.user.tag ?? i.user.username });

/** Reply, edit or follow up depending on the interaction state (always ephemeral for new replies). */
async function reply(i, payload) {
  if (i.deferred) return i.editReply(payload);
  if (i.replied) return i.followUp(eph(payload));
  return i.reply(eph(payload));
}

/** Update the message a component lives on (or reply if that is not possible). */
async function updateOrReply(i, payload) {
  if ((i.isMessageComponent?.() || i.isFromMessage?.()) && !i.replied && !i.deferred) return i.update(payload);
  return reply(i, payload);
}

async function friendlyError(ctx, i, err) {
  let text;
  if (err?.userFacing) text = err.message;
  else {
    const ref = crypto.randomBytes(3).toString('hex');
    getLogger().error({ err, ref, user: i.user?.id, command: i.commandName ?? i.customId }, 'Interaction failed');
    text = `Something went wrong while handling that. Please try again - if it keeps happening tell an admin (ref \`${ref}\`).`;
  }
  const payload = { embeds: [ctx.embeds.error(truncate(text, 3800))], components: [], content: '' };
  try {
    await reply(i, payload);
  } catch (e) {
    getLogger().warn({ err: e }, 'Could not deliver error message');
  }
}

function jsonFile(name, text) {
  return new AttachmentBuilder(Buffer.from(text, 'utf8'), { name });
}

const need = (v, msg) => {
  if (!v) throw new ValidationError(msg);
  return v;
};
const schoolOpt = (ctx, i, name = 'school') =>
  need(ctx.services.schools.find(i.options.getString(name, true)), 'That school was not found - pick one from the autocomplete list.');
const tankOpt = (ctx, i, name = 'tank') =>
  need(ctx.services.tanks.find(i.options.getString(name, true)), 'That vehicle was not found - pick one from the autocomplete list.');
const equipmentOpt = (ctx, i, name = 'equipment') =>
  need(ctx.services.equipment.find(i.options.getString(name, true)), 'That equipment was not found - pick one from the autocomplete list.');
const matchOpt = (ctx, i, name = 'match') => {
  const raw = i.options.getString(name, true).replace(/\D/g, '');
  return need(raw ? ctx.services.matches.load(Number(raw)) : null, 'That match was not found.');
};

/** Option-builder helpers (string option with autocomplete). */
const addAuto = (sub, name, description, required = true) =>
  sub.addStringOption((o) => o.setName(name).setDescription(description).setRequired(required).setAutocomplete(true));
const addSchool = (sub, description = 'School', required = true) => addAuto(sub, 'school', description, required);
const addTank = (sub, description = 'Vehicle', required = true) => addAuto(sub, 'tank', description, required);
const addEquipment = (sub, description = 'Equipment', required = true) => addAuto(sub, 'equipment', description, required);
const addMatch = (sub, description = 'Match (e.g. match-0001)', required = true) => addAuto(sub, 'match', description, required);

/** Autocomplete for the shared option names above. */
async function autocomplete(ctx, i) {
  const f = i.options.getFocused(true);
  const q = String(f.value ?? '');
  const s = ctx.services;
  let out = [];
  if (f.name === 'school') out = s.schools.search(q, 25).map((x) => ({ name: x.name, value: String(x.id) }));
  else if (f.name === 'tank') {
    const list = q.trim() ? s.tanks.search(q, { limit: 25 }) : s.tanks.list().slice(0, 25);
    out = list.map((t) => ({ name: t.display_name, value: String(t.id) }));
  } else if (f.name === 'equipment') {
    const n = q.toLowerCase();
    out = s.equipment.list().filter((e) => !n || e.name.toLowerCase().includes(n) || e.name_id.toLowerCase().includes(n)).slice(0, 25).map((e) => ({ name: `${e.name} (${e.class_name}/${e.slot})`, value: String(e.id) }));
  } else if (f.name === 'camo') {
    const sid = i.options.get('school')?.value;
    const school = sid ? s.schools.find(String(sid)) : null;
    if (school) {
      const n = q.toLowerCase();
      out = s.loadouts.getLoadout(school.id).camos.filter((c) => !n || c.toLowerCase().includes(n)).slice(0, 25).map((c) => ({ name: c, value: c }));
    }
  } else if (f.name === 'match') {
    out = s.matches.list({ limit: 25 }).filter((m) => `match-${String(m.id).padStart(4, '0')}`.includes(q.toLowerCase().replace(/\s/g, '')) || !q).map((m) => {
      const d = s.matches.load(m.id);
      return { name: truncate(`match-${String(m.id).padStart(4, '0')} - ${s.matches.title(d)} (${m.status})`, 100), value: String(m.id) };
    });
  }
  await i.respond(out.map((o) => ({ name: truncate(o.name, 100), value: truncate(o.value, 100) })));
}

module.exports = {
  eph, actorOf, auditActor, reply, updateOrReply, friendlyError, jsonFile,
  schoolOpt, tankOpt, equipmentOpt, matchOpt, addAuto, addSchool, addTank, addEquipment, addMatch, autocomplete,
};
