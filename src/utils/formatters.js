/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

/** Lower-case, strip everything that is not a letter/digit. "T-34 (85)" -> "t3485". */
function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function truncate(s, max) {
  s = String(s ?? '');
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** UTC timestamp "YYYY-MM-DD HH:mm:ss". */
function timestamp(date = new Date()) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/** Backup file stamp "YYYY-MM-DD-HH-mm-ss". */
function fileStamp(date = new Date()) {
  return timestamp(date).replace(/[: ]/g, '-');
}

function matchCode(id) {
  return `match-${String(id).padStart(4, '0')}`;
}

/** Split lines into chunks no longer than `max` characters (for embed field values). */
function chunkLines(lines, max = 1000) {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    const l = truncate(line, max);
    if (cur && cur.length + l.length + 1 > max) {
      chunks.push(cur);
      cur = l;
    } else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function parseJsonArray(s) {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function paginate(items, page, size) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * size, p * size + size), page: p, pages, total: items.length };
}

function formatLabel(era) {
  return { WWI: 'WWI', WWII: 'WWII', COLD_WAR: 'Cold War', MODERN: 'Modern' }[era] ?? era;
}

module.exports = { normalize, truncate, timestamp, fileStamp, matchCode, chunkLines, parseJsonArray, paginate, formatLabel };
