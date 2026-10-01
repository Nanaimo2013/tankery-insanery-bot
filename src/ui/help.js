/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { LEVELS } = require('../../config/permissions');
const { SIDES, STATUS_EMOJI, MAX_TIER } = require('../../config/matches');
const { withEmoji } = require('../../config/emojis');
const { truncate, chunkLines } = require('../utils/formatters');
const { ValidationError } = require('../utils/validators');
const { updateOrReply } = require('./common');

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const LEVEL_INFO = [
  { badge: '👤', name: 'Member' },
  { badge: '🎖️', name: 'TI Referee' },
  { badge: '🛡️', name: 'TI Admin' },
];
const LOCK = ['', 'TI Referee', 'TI Admin'];

/** `/command` - description lines. */
const cmds = (rows) => rows.map(([c, d]) => `\`${c}\` - ${d}`).join('\n');
const field = (name, value, inline = false) => ({ name, value: truncate(value, 1024), inline });
const side = (code) => `${SIDES[code].emoji} **${SIDES[code].name}**`;

// -------------------------------------------------------------------------------------------------
// Pages. `level` = minimum role needed to see it. build(h) -> { title, description, fields }
// h = { ctx, s (services), config, level, member }
// -------------------------------------------------------------------------------------------------
const PAGES = [
  {
    id: 'home', emoji: '🏠', label: 'Home', level: 0, blurb: 'Start here - what the bot does and where to go next',
    build: (h) => {
      const { s, config } = h;
      const who = LEVEL_INFO[h.level];
      const role = h.level === 2 ? `<@&${config.roles.admin}>` : h.level === 1 ? `<@&${config.roles.referee}>` : null;
      let active = 0;
      try { active = s.matches.list({ status: 'ACTIVE', limit: 100 }).length; } catch { /* ignore */ }
      const menu = pagesFor(h.level).filter((p) => p.id !== 'home').map((p) => `${p.emoji} **${p.label}** - ${p.blurb}`);
      return {
        title: '📖 Tankery Insanery - Help Center',
        description: [
          RULE,
          `**${config.bot.name}** runs the Tankery Insanery tournaments: schools with fixed vehicle inventories, referee-run matches between ${side('H')} and ${side('E')}, and ready-to-use **MTC loadout JSON**.`,
          `${who.badge} **Your access:** ${who.name}${role ? ` (${role})` : ''}`,
          h.level < 2 ? `_Pages for ${h.level === 0 ? 'TI Referees and TI Admins' : 'TI Admins'} appear here when you get the role._` : '_You can see every help page._',
          RULE,
        ].join('\n\n'),
        fields: [
          field('📚 Help pages - pick one from the menu below', menu.join('\n')),
          field('📊 Right now', `🏫 **${s.schools.count()}** schools\n🚜 **${s.tanks.count()}** vehicles\n🔥 **${active}** running match${active === 1 ? '' : 'es'}`, true),
          field('⌨️ Handy tricks', '• Type `/` and pick a command - Discord shows every option\n• Fields with a dropdown **autocomplete** - just start typing\n• Everything here is private - only you see it', true),
        ],
      };
    },
  },
  {
    id: 'start', emoji: '🚀', label: 'Quick start', level: 0, blurb: 'The fastest way to get going for your role',
    build: (h) => {
      const fields = [
        field('👤 Everyone', [
          '1️⃣ `/school list` - see the schools',
          '2️⃣ `/school tanks` - open a school to see its vehicles and quantities',
          '3️⃣ `/tank search` - look up any vehicle',
          '4️⃣ Watch the match channel - matches are announced there with the time shown **in your own timezone**',
        ].join('\n')),
      ];
      if (h.level >= 1) {
        fields.push(field('🎖️ TI Referee - run your first match', [
          '1️⃣ `/match create` - the wizard walks you through everything',
          '2️⃣ Choose the format, then the Hawk and Eagle schools',
          '3️⃣ Set the tier limit, full loadout and time, then pick vehicles and equipment',
          '4️⃣ Review, then **✅ Finalize** - the match is announced publicly',
          '5️⃣ When it is time: **🔥 Start**, record round wins, then **🏁 Finish**',
          '6️⃣ **📥 Export JSON** gives you the MTC loadout file',
          '_Shortcut: `/match panel` opens your referee panel with all of this as buttons._',
        ].join('\n')));
      }
      if (h.level >= 2) {
        fields.push(field('🛡️ TI Admin - keep things healthy', [
          '1️⃣ `/admin panel` - the control centre',
          '2️⃣ `/admin validate-database` - catches missing NameIDs, bad quantities and more',
          '3️⃣ `/school loadout …` - change what a school owns',
          '4️⃣ `/admin backup` - extra backup any time (automatic ones also run)',
        ].join('\n')));
      }
      return { title: '🚀 Quick start', description: `Steps for your role (${LEVEL_INFO[h.level].badge} ${LEVEL_INFO[h.level].name}).`, fields };
    },
  },
  {
    id: 'browse', emoji: '🔎', label: 'Browsing', level: 0, blurb: 'Look up schools, loadouts and vehicles',
    build: (h) => ({
      title: '🔎 Browsing schools & vehicles',
      description: 'Everything here is read-only and private to you.',
      fields: [
        field('🏫 Schools', cmds([
          ['/school list', 'every school, with page buttons and search'],
          ['/school view <school>', 'overview: country, vehicles, equipment, camouflage and decals'],
          ['/school tanks <school>', 'the full vehicle list with quantities'],
        ])),
        field('🚜 Vehicles', cmds([
          ['/tank list', 'browse the whole MTC catalogue'],
          ['/tank search <query>', 'e.g. `tiger`, `sherman`, `t-34`'],
          ['/tank info <tank>', 'nation, type, era, tier and the exact MTC NameID'],
        ])),
        field('ℹ️ Good to know', [
          `• ${h.config.access.publicLoadoutView ? 'Anyone can open `/school view` and `/school tanks`.' : 'Opening a school\'s loadout (`/school view`, `/school tanks`) needs the **TI Referee** role on this server.'}`,
          '• Each school shows its own emoji, so you can spot it at a glance.',
          '• ⚠️ next to a vehicle = its MTC NameID is not verified yet, so it can\'t be used in matches.',
          '• 🔴 = disabled.',
        ].join('\n')),
      ],
    }),
  },
  {
    id: 'schools', emoji: '🏫', label: 'School directory', level: 0, blurb: 'Every school with its emoji',
    build: (h) => {
      const schools = h.s.schools.list();
      const lines = schools.map((x) => `${withEmoji(x)}${x.country ? ` - ${x.country}` : ''}${x.enabled ? '' : ' 🔴'}`);
      const chunks = chunkLines(lines.length ? lines : ['_No schools yet._'], 1000);
      return {
        title: `🏫 School directory (${schools.length})`,
        description: 'Use `/school view` or `/school tanks` for the details of any school.',
        fields: chunks.slice(0, 5).map((c, n) => field(n ? 'Schools (cont.)' : 'Schools', c)),
      };
    },
  },
  {
    id: 'create', emoji: '⚔️', label: 'Creating a match', level: 1, blurb: 'The match wizard, step by step',
    build: () => ({
      title: '⚔️ Creating a match',
      description: 'Run `/match create` (or press **⚔️ Create Match** in `/match panel`). The wizard is private to you and expires after **30 minutes** of inactivity - drafts are saved, reopen one with `/match edit`.',
      fields: [
        field('The steps', [
          '**1️⃣ Format** - 1v1 up to 5v5, or **Custom** for uneven sides (e.g. 2 vs 3)',
          `**2️⃣ ${SIDES.H.name}** schools`,
          `**3️⃣ ${SIDES.E.name}** schools`,
          '**4️⃣ Rules** - tier limit, **full loadout** on/off, date & time',
          '**5️⃣ Tanks** - pick vehicles and amounts _(skipped when full loadout is on)_',
          '**6️⃣ Equipment** - basics for all teams + extra gear per school',
          '**7️⃣ Review** - check everything, then **✅ Finalize**',
        ].join('\n')),
        field('✅ What Finalize does', '• Checks the match one last time and freezes it (status 🟢 **Ready**)\n• Posts the public announcement in the match channel\n• Posts the MTC loadout JSON in the loadout channel (if one is configured)'),
        field('💡 Tips', '• Use ⬅ **Back** at any time - nothing is lost\n• The vehicle list shows how many each school owns and your current selection\n• Red warnings under the review tell you exactly what is missing'),
      ],
    }),
  },
  {
    id: 'run', emoji: '🏁', label: 'Running a match', level: 1, blurb: 'Start, score, schedule, finish, cancel',
    build: () => ({
      title: '🏁 Running a match',
      description: 'Open any of your matches with `/match view` or from **My Matches** - the controls are private to you (admins can manage every match).',
      fields: [
        field('📈 Match life cycle', `${STATUS_EMOJI.DRAFT} **Draft** → ${STATUS_EMOJI.READY} **Ready** → ${STATUS_EMOJI.ACTIVE} **In progress** → ${STATUS_EMOJI.COMPLETED} **Completed**\n${STATUS_EMOJI.CANCELLED} **Cancelled** is possible before it completes.\nThe public announcement is edited in place at every step.`),
        field('🎮 Commands', cmds([
          ['/match start <match>', 'start a Ready match'],
          ['/match rounds <match> hawk eagle', 'set the round wins'],
          ['/match finish <match>', 'finish - more round wins = winner'],
          ['/match cancel <match>', 'cancel a match'],
          ['/match schedule <match>', 'date, time and timezone'],
          ['/match referee <match> <user>', 'hand over to another referee'],
          ['/match list · /match history', 'your matches · finished matches'],
        ])),
        field('🔘 Buttons in your match panel', `**${SIDES.H.emoji} Hawk +1 / ${SIDES.E.emoji} Eagle +1** record rounds, **✍️ Set score** sets them exactly, **📅 Set time** and **👤 Change referee** do what they say.`),
        field('🕒 Scheduling', 'Type the date as `2026-10-18` and the time as `19:30` or `7:30 PM`, plus a timezone like `America/Vancouver`, `EST`, `CET` or `UTC+2`. Everyone sees it in **their own timezone**, and your last timezone is remembered.'),
        field('🔓 Mistake?', 'Only a **TI Admin** can re-open a finalized or cancelled match for editing (`/match reopen`).'),
      ],
    }),
  },
  {
    id: 'mtc', emoji: '📦', label: 'MTC loadout JSON', level: 1, blurb: 'What the exported file contains',
    build: () => ({
      title: '📦 MTC loadout JSON',
      description: 'The export is exactly the format MTC reads - paste it in or load the file.',
      fields: [
        field('How to get it', cmds([
          ['/match export <match>', 'sends the file'],
          ['📥 Export JSON / 📋 Copy JSON', 'buttons in the match panel (copy posts it as text)'],
        ])),
        field('What is inside', [
          `• **${SIDES.E.name}** and **${SIDES.H.name}** sections - each team only gets *its own* schools' vehicles and gear`,
          '• One entry per vehicle with its exact MTC `NameID` and `LimitPerTeam` (the quantity)',
          '• Schools on the same side are merged into one list',
          '• An all-teams section with the basics (e.g. Repair Torch, Binoculars, Camo Nets, Engineering Tool …) plus `RemoveVehicle`',
          '• Every `Tier` is written as `1`, like the MTC example - tiers only matter inside the bot',
        ].join('\n')),
        field('⚠️ Notes', 'Equipment or vehicles without a verified NameID are left out and listed under **NOTES** on the review screen. Ask a TI Admin to verify them.'),
      ],
    }),
  },
  {
    id: 'loadouts', emoji: '🧰', label: 'School loadouts', level: 2, blurb: 'Edit what each school owns',
    build: () => ({
      title: '🧰 Managing school loadouts',
      description: 'Every change is saved to the **audit log** with who did it and the before/after value.',
      fields: [
        field('🚜 Vehicles', cmds([
          ['/school loadout add-tank', 'add vehicles (optional special requirement)'],
          ['/school loadout remove-tank', 'remove some, or all if no quantity is given'],
          ['/school loadout set-quantity', 'set an exact number (0 allowed)'],
        ])),
        field('🧰 Equipment, camo & rules', cmds([
          ['/school loadout add-equipment · remove-equipment', 'tools a school brings'],
          ['/school loadout add-camo · remove-camo', 'camouflage list'],
          ['/school loadout set-requirement', 'special requirement for a school or one vehicle'],
        ])),
        field('🏫 Schools & files', cmds([
          ['/school add · edit · remove', 'create, rename, enable/disable or delete (remove needs `confirm`)'],
          ['/school import <file>', 'load schools from JSON - everything or nothing is applied'],
          ['/school export [school] [format]', '`raw` (re-importable) or `mtc` (choose the team)'],
        ])),
        field('💡 Tip', 'The same loadout tools also exist as `/loadout …`. Unknown vehicles/equipment in an import are created flagged ⚠️ - never silently renamed.'),
      ],
    }),
  },
  {
    id: 'catalogue', emoji: '🚜', label: 'Catalogue', level: 2, blurb: 'Vehicles, equipment and the basics',
    build: (h) => ({
      title: '🚜 Vehicle & equipment catalogue',
      description: 'The catalogue is the list of MTC vehicles and tools the whole bot uses.',
      fields: [
        field('🚜 Vehicles', cmds([
          ['/tank add', 'new vehicle - needs the **exact MTC NameID** and an era'],
          ['/tank edit', 'change details; setting the NameID marks it verified'],
          ['/tank enable · disable · remove', 'switch a vehicle on/off or delete it'],
        ])),
        field('🧰 Equipment', cmds([
          ['/admin equipment add · edit · remove', 'manage MTC tools (class + slot + NameID)'],
          ['/admin equipment base', 'list / add / remove the **basics every new match gives to all teams**'],
        ])),
        field('✅ Verified vs ⚠️ needs review', 'Anything created automatically (for example during an import) is flagged **needs review** until an admin confirms its real MTC NameID. Flagged items are kept but never exported to MTC.'),
        field('⏳ Eras', `Allowed eras: change with \`/admin config setting:allowed_eras value:WWI,WWII\`. Current default is WWI and WWII.`),
      ],
    }),
  },
  {
    id: 'admin', emoji: '🛠️', label: 'Admin tools', level: 2, blurb: 'Panel, validation, backups, audit, maintenance',
    build: () => ({
      title: '🛠️ Admin tools',
      description: 'Admins also count as referees (unless disabled in the server config).',
      fields: [
        field('🎛️ Commands', cmds([
          ['/admin panel', 'control centre with sections and buttons'],
          ['/admin validate-database', 'data-quality report (also on the panel)'],
          ['/admin config', 'view/change runtime settings'],
          ['/admin backup', 'make a database backup now'],
          ['/admin audit', 'browse the audit log - who changed what, when'],
          ['/match reopen', 'unlock a finalized or cancelled match'],
        ])),
        field('🔒 Permissions', 'Every command is checked on the server **and again on every button click**. Anything not explicitly given to referees defaults to **admin only**. Referees are made with the Discord role - there is no command for it.'),
        field('🛠️ Maintenance mode', 'The person running the bot can switch it from the server console: `maintenance on [reason]` / `off` / `status`. While on, every command shows a maintenance notice and the bot goes Do Not Disturb.'),
        field('💾 Backups', 'Automatic backups run on a schedule and old ones are cleaned up. Resetting the database (`npm run reseed`) also keeps a copy of the old one in `backups/`.'),
      ],
    }),
  },
  {
    id: 'faq', emoji: '❓', label: 'FAQ & troubleshooting', level: 0, blurb: 'Quick fixes for common problems',
    build: (h) => ({
      title: '❓ FAQ & troubleshooting',
      description: 'Still stuck? Ask a TI Admin and give them the `ref` code if the bot showed one.',
      fields: [
        field('I can\'t see or use `/match`', `Match commands need the ${h.config.roles.referee ? `<@&${h.config.roles.referee}>` : '**TI Referee**'} role. Ask an admin.`),
        field('"This control is no longer active"', 'The button belongs to an old message or the bot restarted. Run the command again.'),
        field('"The wizard expired"', 'Wizards last 30 minutes without activity. Your draft is saved - open it with `/match edit`.'),
        field('A vehicle is missing from the picker', 'It is probably blocked: none owned, disabled, era not allowed, no verified NameID (⚠️) or above the tier limit. The wizard lists blocked vehicles with the reason.'),
        field('The time looks wrong', 'Set the timezone when scheduling (e.g. `timezone: America/Vancouver`). Everyone else sees the converted time automatically.'),
        field('"Slow down"', 'You are limited to a few actions every 10 seconds. Wait a moment and try again.'),
        field('"Down for maintenance"', 'An admin switched maintenance mode on. Everything works again when it is turned off.'),
      ],
    }),
  },
];

const byId = new Map(PAGES.map((p) => [p.id, p]));
const pagesFor = (level) => PAGES.filter((p) => p.level <= level);

// -------------------------------------------------------------------------------------------------
function render(ctx, member, pageId = 'home') {
  const { permissions } = ctx.services;
  const level = permissions.levelOf(member);

  let page = byId.get(pageId) ?? byId.get('home');

  if (page.level > level) {
    throw new ValidationError(
      `The **${page.label}** help page is for **${LOCK[page.level]}s**.`
    );
  }

  const list = pagesFor(level);
  const idx = list.findIndex((p) => p.id === page.id);

  const h = {
    ctx,
    s: ctx.services,
    config: ctx.config,
    level,
    member,
  };

  const built = page.build(h);

  const color =
    page.id === 'home'
      ? ctx.config.colors.primary
      : level === 2
        ? ctx.config.colors.info
        : ctx.config.colors.primary;

  const em = ctx.embeds
    .base(color)
    .setTitle(truncate(built.title, 250))
    .setDescription(truncate(built.description ?? '', 4000))
    .setFooter({
      text: truncate(
        `Page ${idx + 1}/${list.length} • ${ctx.config.bot.name} v${ctx.config.bot.version} • ${ctx.config.bot.copyright}`,
        2000
      ),
    });

  if (built.fields?.length) {
    em.addFields(built.fields.slice(0, 25));
  }

  const avatar = ctx.client?.user?.displayAvatarURL?.();

  if (avatar) {
    em.setThumbnail(avatar);
  }

  // ---------------------------------------------------------------------------
  // Help page selector
  // ---------------------------------------------------------------------------

  const menu = new StringSelectMenuBuilder()
    .setCustomId('hp:pick')
    .setPlaceholder('📖 Choose a help page…')
    .addOptions(
      list.slice(0, 25).map((p) => ({
        label: p.label,
        description: truncate(p.blurb, 100),
        emoji: p.emoji,
        value: p.id,
        default: p.id === page.id,
      }))
    );

  // ---------------------------------------------------------------------------
  // Navigation
  //
  // Include the CURRENT page ID in every button.
  //
  // Example:
  //   hp:prev:start
  //   hp:home:start
  //   hp:next:start
  //
  // This allows handle() to know exactly which page the user is currently on.
  // ---------------------------------------------------------------------------

  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hp:prev:${page.id}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(idx <= 0),

    new ButtonBuilder()
      .setCustomId(`hp:home:${page.id}`)
      .setLabel('🏠 Home')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page.id === 'home'),

    new ButtonBuilder()
      .setCustomId(`hp:next:${page.id}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(idx >= list.length - 1),

    new ButtonBuilder()
      .setCustomId(`hp:close:${page.id}`)
      .setLabel('✖ Close')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [em],
    components: [
      new ActionRowBuilder().addComponents(menu),
      nav,
    ],
    content: '',
  };
}

/** Handle `hp:*` menu and buttons.
 * The page is re-checked against the user's CURRENT roles every time.
 */
async function handle(ctx, i, parts) {
  const action = parts[1];
  const currentPageId = parts[2] ?? 'home';

  // ---------------------------------------------------------------------------
  // Close
  // ---------------------------------------------------------------------------

  if (action === 'close') {
    return i.update({
      components: [],
    });
  }

  let target;

  // ---------------------------------------------------------------------------
  // Dropdown
  // ---------------------------------------------------------------------------

  if (action === 'pick') {
    target = i.values?.[0] ?? 'home';
  }

  // ---------------------------------------------------------------------------
  // Previous
  // ---------------------------------------------------------------------------

  else if (action === 'prev') {
    const currentPage = byId.get(currentPageId) ?? byId.get('home');

    const level = ctx.services.permissions.levelOf(i.member);
    const list = pagesFor(level);

    const idx = list.findIndex(
      (p) => p.id === currentPage.id
    );

    target =
      list[Math.max(0, idx - 1)]?.id ??
      'home';
  }

  // ---------------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------------

  else if (action === 'home') {
    target = 'home';
  }

  // ---------------------------------------------------------------------------
  // Next
  // ---------------------------------------------------------------------------

  else if (action === 'next') {
    const currentPage = byId.get(currentPageId) ?? byId.get('home');

    const level = ctx.services.permissions.levelOf(i.member);
    const list = pagesFor(level);

    const idx = list.findIndex(
      (p) => p.id === currentPage.id
    );

    target =
      list[Math.min(list.length - 1, idx + 1)]?.id ??
      currentPage.id;
  }

  // ---------------------------------------------------------------------------
  // Unknown interaction
  // ---------------------------------------------------------------------------

  else {
    return i.reply({
      content: '❌ This help control is no longer valid. Please run `/help` again.',
      ephemeral: true,
    });
  }

  return updateOrReply(
    i,
    render(ctx, i.member, target || 'home')
  );
}

module.exports = { PAGES, pagesFor, render, handle, LEVELS };
