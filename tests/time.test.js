'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSchedule, discordTime, discordWhen } = require('../src/utils/time');

const iso = (o) => new Date(parseSchedule(o).epoch * 1000).toISOString();

test('times are converted from the typed timezone (DST aware) to a unix timestamp', () => {
  assert.equal(iso({ date: '2026-10-18', time: '7:30 PM', timezone: 'America/Vancouver' }), '2026-10-19T02:30:00.000Z'); // PDT
  assert.equal(iso({ date: '2026-12-18', time: '19:30', timezone: 'PST' }), '2026-12-19T03:30:00.000Z'); // PST
  assert.equal(iso({ date: '2026-10-18', time: '20:00', timezone: 'UTC+2' }), '2026-10-18T18:00:00.000Z');
  assert.equal(iso({ date: '2026-10-18', time: '20:00', timezone: 'Asia/Tokyo' }), '2026-10-18T11:00:00.000Z');
  assert.equal(iso({ date: '2026/10/18', time: '2000', timezone: 'utc' }), '2026-10-18T20:00:00.000Z');
});

test('bad input is rejected with a helpful message', () => {
  assert.throws(() => parseSchedule({ date: '2026-02-30', time: '20:00', timezone: 'UTC' }), /not a real calendar date/);
  assert.throws(() => parseSchedule({ date: '18-10-2026', time: '20:00', timezone: 'UTC' }), /Date must look like/);
  assert.throws(() => parseSchedule({ date: '2026-10-18', time: '25:00', timezone: 'UTC' }), /valid time/);
  assert.throws(() => parseSchedule({ date: '2026-10-18', time: '13:00 PM', timezone: 'UTC' }), /1-12/);
  assert.throws(() => parseSchedule({ date: '2026-10-18', time: '20:00', timezone: 'Mars/Base' }), /timezone/);
});

test('Discord timestamps render in every viewer\'s own timezone', () => {
  assert.equal(discordTime(1792377000), '<t:1792377000:F>');
  assert.equal(discordWhen(1792377000), '<t:1792377000:F>\n(<t:1792377000:R>)');
});
