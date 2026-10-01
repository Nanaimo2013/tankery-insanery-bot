/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

/**
 * Custom Discord emojis. To change one, edit the id/name here - nothing else in the bot needs touching.
 * The bot must be in the server that owns these emojis (or they must be application emojis).
 * Schools with no emoji fall back to 🏫.
 */
const FALLBACK = '🏫';

const E = (name, id) => Object.freeze({ name, id });

const TEAM_EMOJIS = Object.freeze({
  H: E('Hawk_Republic', '1555319838682124308'),
  E: E('Eage_Federation', '1555328175276425348'),
});

/** [pattern matched against the lower-cased school name with everything but a-z0-9 removed, emoji] */
const SCHOOL_EMOJI_RULES = [
  [/allstars/, E('All_Stars', '1555325242388512818')],
  [/koala/, E('Koala', '1555319911192993914')],
  [/gregor/, E('Gregor', '1555319914699694110')],
  [/oarai/, E('Oarai', '1555319906541641789')],
  [/gloriana/, E('St_Gloriana', '1555319902477230240')],
  [/jatkosota|keizoku|continuation/, E('Jaktosoka', '1555319912879226900')],
  [/pravda/, E('Pravda', '1555319903777591366')],
  [/saunders/, E('Saunders', '1555319901244362842')],
  [/kuromorimine/, E('Kuromorimine', '1555319908760428777')],
  [/bcfreedom/, E('BC_Freedom', '1555319925898346576')],
  [/chihatan/, E('Chihatan', '1555319918558187570')],
  [/waffle/, E('Waffle', '1555319891769294848')],
  [/^count/, E('Count', '1555319916834463765')],
  [/anzio/, E('Anzio', '1555319924283543742')],
  [/bonple/, E('Bonple', '1555319920491761786')],
  [/viggen/, E('Viggen', '1555319893799215124')],
  [/viking/, E('Viking', '1555326418005794876')],
  [/yogurt/, E('Yogurt', '1555319889328083054')],
  [/bellwall/, E('Bellwall', '1555319922488381480')],
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const markup = (e) => `<:${e.name}:${e.id}>`;
const cdn = (e) => `https://cdn.discordapp.com/emojis/${e.id}.png`;

/** The custom emoji for a school ({name, short_name} or a plain name), or null. */
function findSchoolEmoji(school) {
  const hay = typeof school === 'string' ? [school] : [school?.name, school?.short_name];
  for (const h of hay) {
    const n = norm(h);
    if (!n) continue;
    const hit = SCHOOL_EMOJI_RULES.find(([re]) => re.test(n));
    if (hit) return hit[1];
  }
  return null;
}

/** Text form for messages / embeds: "<:Koala:123>" or 🏫. */
const schoolEmoji = (school) => { const e = findSchoolEmoji(school); return e ? markup(e) : FALLBACK; };
/** Object form for select-menu options and buttons: { id, name } or { name: '🏫' }. */
const schoolEmojiObj = (school) => { const e = findSchoolEmoji(school); return e ? { id: e.id, name: e.name } : { name: FALLBACK }; };
/** "<:Koala:123> Koala Forest Academy" */
const withEmoji = (school) => `${schoolEmoji(school)} ${typeof school === 'string' ? school : school?.name ?? '?'}`;
/** Image URL of the school's emoji (for embed thumbnails), or null. */
const schoolEmojiUrl = (school) => { const e = findSchoolEmoji(school); return e ? cdn(e) : null; };

const teamEmoji = (code) => markup(TEAM_EMOJIS[code]);
const teamEmojiObj = (code) => ({ id: TEAM_EMOJIS[code].id, name: TEAM_EMOJIS[code].name });

module.exports = { FALLBACK, TEAM_EMOJIS, SCHOOL_EMOJI_RULES, findSchoolEmoji, schoolEmoji, schoolEmojiObj, schoolEmojiUrl, withEmoji, teamEmoji, teamEmojiObj };
