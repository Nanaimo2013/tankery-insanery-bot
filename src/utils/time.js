/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ValidationError } = require('./validators');

/** Common abbreviations -> IANA zones (DST-aware). Anything else: use an IANA name like America/Vancouver. */
const ABBREVIATIONS = Object.freeze({
  UTC: 'UTC', GMT: 'UTC', Z: 'UTC',
  EST: 'America/New_York', EDT: 'America/New_York', ET: 'America/New_York',
  CST: 'America/Chicago', CDT: 'America/Chicago', CT: 'America/Chicago',
  MST: 'America/Denver', MDT: 'America/Denver', MT: 'America/Denver',
  PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles', PT: 'America/Los_Angeles',
  AKST: 'America/Anchorage', AKDT: 'America/Anchorage', HST: 'Pacific/Honolulu',
  AST: 'America/Halifax', ADT: 'America/Halifax', NST: 'America/St_Johns', NDT: 'America/St_Johns',
  BST: 'Europe/London', WET: 'Europe/Lisbon', WEST: 'Europe/Lisbon',
  CET: 'Europe/Paris', CEST: 'Europe/Paris', EET: 'Europe/Athens', EEST: 'Europe/Athens', MSK: 'Europe/Moscow',
  IST: 'Asia/Kolkata', SGT: 'Asia/Singapore', HKT: 'Asia/Hong_Kong', JST: 'Asia/Tokyo', KST: 'Asia/Seoul',
  AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney', ACST: 'Australia/Adelaide', ACDT: 'Australia/Adelaide', AWST: 'Australia/Perth',
  NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland',
});

/** @returns {{ zone: string|null, offsetMinutes: number|null, label: string }} */
function resolveZone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { zone: 'UTC', offsetMinutes: null, label: 'UTC' };
  const abbr = ABBREVIATIONS[raw.toUpperCase()];
  if (abbr) return { zone: abbr, offsetMinutes: null, label: abbr };

  const off = /^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(raw);
  if (off) {
    const mins = Number(off[2]) * 60 + Number(off[3] ?? 0);
    if (Number(off[2]) > 14 || Number(off[3] ?? 0) > 59) throw new ValidationError(`"${raw}" is not a valid UTC offset.`);
    const signed = off[1] === '-' ? -mins : mins;
    const pad = (n) => String(n).padStart(2, '0');
    return { zone: null, offsetMinutes: signed, label: `UTC${off[1]}${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` };
  }
  try {
    const zone = new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone;
    return { zone, offsetMinutes: null, label: zone };
  } catch {
    throw new ValidationError(
      `I don't know the timezone "${raw}". Use a name like \`America/Vancouver\` or \`Europe/London\`, an abbreviation like \`EST\`, \`PST\` or \`CET\`, or an offset like \`UTC+2\`.`,
    );
  }
}

/** Accepts YYYY-MM-DD or YYYY/MM/DD. */
function parseDate(input) {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(String(input ?? '').trim());
  if (!m) throw new ValidationError('Date must look like `2026-10-18` (year-month-day).');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new ValidationError(`${m[0]} is not a real calendar date.`);
  }
  return { y, mo, d };
}

/** Accepts 19:30, 1930, 7:30 PM, 7pm. */
function parseTime(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  let m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(raw);
  if (!m && /^\d{4}$/.test(raw)) m = [raw, raw.slice(0, 2), raw.slice(2), undefined];
  if (!m) throw new ValidationError('Time must look like `19:30` or `7:30 PM`.');
  let h = Number(m[1]);
  const mi = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) throw new ValidationError('With AM/PM the hour must be 1-12.');
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
  }
  if (h > 23 || mi > 59) throw new ValidationError('That is not a valid time of day.');
  return { h, mi };
}

function zoneOffsetMs(zone, ms) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wall-clock time in a zone -> unix seconds. */
function toEpochSeconds({ y, mo, d, h, mi }, { zone, offsetMinutes }) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (zone === null) return Math.floor((guess - offsetMinutes * 60_000) / 1000);
  let t = guess - zoneOffsetMs(zone, guess);
  const second = zoneOffsetMs(zone, t);
  t = guess - second;
  return Math.floor(t / 1000);
}

/** Parse the three modal / command fields into { epoch, zoneLabel }. */
function parseSchedule({ date, time, timezone }) {
  const z = resolveZone(timezone);
  const epoch = toEpochSeconds({ ...parseDate(date), ...parseTime(time) }, z);
  return { epoch, zoneLabel: z.label };
}

/** Discord renders <t:...> in every viewer's own timezone and language. */
const discordTime = (epoch, style = 'F') => `<t:${epoch}:${style}>`;
const discordWhen = (epoch) => `${discordTime(epoch, 'F')}\n(${discordTime(epoch, 'R')})`;

module.exports = { resolveZone, parseDate, parseTime, toEpochSeconds, parseSchedule, discordTime, discordWhen, ABBREVIATIONS };
