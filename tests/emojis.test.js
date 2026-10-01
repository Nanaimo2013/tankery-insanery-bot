'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { schoolEmoji, schoolEmojiObj, withEmoji, teamEmoji, findSchoolEmoji, FALLBACK } = require('../config/emojis');
const { SIDES } = require('../config/matches');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/seed/schools.json'), 'utf8')).schools;

test('every seeded school has its own emoji, except Viking Fisheries and All-Stars (fallback)', () => {
  const none = seed.filter((x) => !findSchoolEmoji(x)).map((x) => x.name);
  assert.deepEqual(none, ['Viking Fisheries High School', 'All-Stars University Student Selection Team']);
  const names = seed.map((x) => findSchoolEmoji(x)?.name).filter(Boolean);
  assert.equal(new Set(names).size, names.length, 'no emoji is used by two schools');
});

test('markup, object form and fallback', () => {
  assert.equal(schoolEmoji({ name: 'Koala Forest Academy' }), '<:Koala:1555319912879226900>');
  assert.deepEqual(schoolEmojiObj({ name: 'Bellwall Academy' }), { id: '1555319924283543742', name: 'Bellwall' });
  assert.equal(schoolEmoji({ name: 'Viking Fisheries High School' }), FALLBACK);
  assert.equal(withEmoji({ name: 'Count High School' }), '<:Count:1555319918558187570> Count High School');
});

test('team emojis are wired into SIDES', () => {
  assert.equal(SIDES.H.emoji, teamEmoji('H'));
  assert.equal(SIDES.E.emojiObj.name, 'Schwalbenheim_Kingdom');
});
