/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ValidationError } = require('./validators');

const MAX_BYTES = 2 * 1024 * 1024;

/** Download and parse a JSON attachment (size-limited). */
async function readJsonAttachment(att) {
  if (!att) throw new ValidationError('No file attached.');
  if (att.size > MAX_BYTES) throw new ValidationError('That file is too large (max 2 MB).');
  if (!/\.json$/i.test(att.name ?? '') && !String(att.contentType ?? '').includes('json')) throw new ValidationError('Please attach a .json file.');
  const res = await fetch(att.url);
  if (!res.ok) throw new ValidationError('Could not download the attachment.');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new ValidationError('That file is too large (max 2 MB).');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ValidationError(`That file is not valid JSON: ${err.message}`);
  }
}

module.exports = { readJsonAttachment };
