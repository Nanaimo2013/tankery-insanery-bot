/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { z } = require('zod');
const { ALL_ERAS, WEAPON_CLASSES, SLOTS } = require('../../config/mtc');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.userFacing = true;
  }
}

const nonEmpty = (max = 100) => z.string().trim().min(1).max(max);

const tankInput = z.object({
  display_name: nonEmpty(100),
  name_id: nonEmpty(100),
  nation: z.string().trim().max(60).nullish(),
  era: z.enum(ALL_ERAS),
  vehicle_type: z.string().trim().max(60).nullish(),
  tier: z.number().int().min(0).max(20).default(1),
  year_introduced: z.number().int().min(1900).max(2100).nullish(),
  notes: z.string().trim().max(500).nullish(),
});

const equipmentInput = z.object({
  name: nonEmpty(100),
  name_id: nonEmpty(100),
  class_name: z.enum(WEAPON_CLASSES),
  slot: z.enum(SLOTS),
  tier: z.number().int().min(0).max(20).default(1),
  notes: z.string().trim().max(500).nullish(),
});

const schoolInput = z.object({
  name: nonEmpty(100),
  short_name: z.string().trim().max(40).nullish(),
  country: z.string().trim().max(60).nullish(),
  description: z.string().trim().max(1000).nullish(),
  discord_role_id: z.string().regex(/^\d{17,20}$/).nullish(),
});

/** Shape accepted by /school import, /loadout import and the seed scripts. */
const importSchool = z.object({
  name: nonEmpty(100),
  short_name: z.string().max(40).nullish(),
  country: z.string().max(60).nullish(),
  description: z.string().max(1000).nullish(),
  discord_role_id: z.string().regex(/^\d{17,20}$/).nullish(),
  enabled: z.boolean().optional(),
  notes: z.string().max(2000).nullish(),
  camo: z.array(z.string().trim().min(1).max(100)).default([]),
  decals: z.array(z.string().trim().min(1).max(200)).default([]),
  special_requirements: z.array(z.string().trim().min(1).max(500)).default([]),
  tanks: z
    .array(
      z.object({
        name: nonEmpty(100),
        name_id: z.string().max(100).nullish(),
        quantity: z.number().int().min(0).max(9999).nullable().optional(),
        notes: z.string().max(500).nullish(),
        special_requirements: z.string().max(500).nullish(),
      }),
    )
    .default([]),
  equipment: z.array(z.string().trim().min(1).max(100)).default([]),
});
const importFile = z.object({ schools: z.array(importSchool).min(1).max(200) });

function parseOrThrow(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).slice(0, 5).join('; ');
    throw new ValidationError(`Invalid input - ${msg}`);
  }
  return r.data;
}

function parseQuantity(raw, { min = 0, max = 9999 } = {}) {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) throw new ValidationError('Quantity must be a whole number.');
  const n = Number(s);
  if (n < min || n > max) throw new ValidationError(`Quantity must be between ${min} and ${max}.`);
  return n;
}

module.exports = { ValidationError, tankInput, equipmentInput, schoolInput, importFile, importSchool, parseOrThrow, parseQuantity };
