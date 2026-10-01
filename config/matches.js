/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { teamEmoji, teamEmojiObj } = require('./emojis');

const STATUS = Object.freeze({ DRAFT: 'DRAFT', READY: 'READY', ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' });
const STATUS_EMOJI = Object.freeze({ DRAFT: '📝', READY: '🟢', ACTIVE: '🔥', COMPLETED: '🏁', CANCELLED: '🚫' });
const STATUS_LABEL = Object.freeze({ DRAFT: 'Draft', READY: 'Ready', ACTIVE: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' });

/**
 * The two MTC teams. `code` is what is stored in the database and used in team keys (H0, H1, E0 ...).
 * `mtcName` is the exact team key MTC uses in the loadout JSON.
 */
const SIDES = Object.freeze({
  H: Object.freeze({ code: 'H', id: 'hawk', name: 'Hawk Republic', short: 'Hawk', emoji: teamEmoji('H'), emojiObj: teamEmojiObj('H') }),
  E: Object.freeze({ code: 'E', id: 'eagle', name: 'Eagle Federation', short: 'Eagle', emoji: teamEmoji('E'), emojiObj: teamEmojiObj('E') }),
});
const SIDE_CODES = Object.freeze(['H', 'E']);

/** Quick-pick formats shown in the wizard. "Custom" opens a modal. */
const FORMAT_PRESETS = Object.freeze([1, 2, 3, 4, 5]);

/** Highest tier in the MTC catalogue. */
const MAX_TIER = 6;
/** Tier-limit choices for the match wizard (null = no limit). */
const TIER_CHOICES = Object.freeze([
  { value: '1', cap: 1, label: 'Tier 1 only' },
  { value: '2', cap: 2, label: 'Tier 2 and below' },
  { value: '3', cap: 3, label: 'Tier 3 and below' },
  { value: '4', cap: 4, label: 'Tier 4 and below' },
  { value: '5', cap: 5, label: 'Tier 5 and below' },
  { value: 'none', cap: null, label: 'No tier limit (all tiers)' },
]);

module.exports = { STATUS, STATUS_EMOJI, STATUS_LABEL, SIDES, SIDE_CODES, FORMAT_PRESETS, MAX_TIER, TIER_CHOICES };
