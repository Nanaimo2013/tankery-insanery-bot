# Tankery Insanery - MTC Match Manager

A Discord bot for running Girls und Panzer inspired tank tournaments: schools with permanent vehicle inventories, referee-run matches and **MTC-ready JSON loadouts**.

<div align="center">

### The complete match manager for the Tankery Insanery community

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-22-339933.svg?style=for-the-badge)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg?style=for-the-badge)](https://discord.js.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57.svg?style=for-the-badge)](https://github.com/WiseLibs/better-sqlite3)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=for-the-badge)](https://www.docker.com/)
[![Tests](https://img.shields.io/badge/tests-65%20passing-success.svg?style=for-the-badge)](#-development)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/VERSION-1.1.0-blue.svg?style=for-the-badge)](package.json)

<br/>

[✨ Features](#-features) •
[🚀 Getting Started](#-getting-started) •
[🎮 Commands](#-commands) •
[📦 MTC JSON](#-mtc-loadout-json) •
[🔧 Configuration](#-configuration) •
[🐳 Deployment](#-deployment) •
[🐛 Troubleshooting](#-troubleshooting)

</div>

<br/>

> Girls und Panzer, MTC, vehicle names and manufacturers belong to their respective owners; this project claims no ownership of them.

---

## ✨ Features

<table>
<tr>
<td>

### ⚔️ Match Management
- **Match Wizard** - `/match create` guides referees step by step
- **Hawk vs Eagle** - Custom formats from 1v1 to uneven sides
- **Live Announcement** - Posted at finalize, edited in place on every change
- **Round Wins** - Record scores, the winner is announced automatically

</td>
<td>

### 🏫 Schools & Loadouts
- **19 JSL Schools** - Seeded with quantities, camo, decals and equipment
- **Permanent Inventories** - Integer quantities per vehicle, never exceeded
- **Custom Emojis** - Every school shows its own emoji everywhere
- **Special Requirements** - Per-school and per-vehicle notes

</td>
</tr>
<tr>
<td>

### 📦 MTC Export
- **Exact MTC Format** - `Eagle Federation` / `Hawk Republic` sections
- **Per-team Gear** - Each team only gets its own schools' vehicles and equipment
- **Tier Limits** - Tier 1 only up to no limit
- **Copy or Download** - One click from the match panel

</td>
<td>

### 🔒 Admin & Safety
- **Role-based Access** - `TI Admin` and `TI Referee`, re-checked on every click
- **Audit Log** - Every change recorded, optionally mirrored to a channel
- **Backups & Validation** - Automatic backups and a data-quality report
- **Maintenance Mode** - Switch the bot off from the server console

</td>
</tr>
</table>

### 🕒 Quality of Life
- **`/help`** - Interactive, role-aware help center (dropdown + buttons, private to the user)
- **Timezone-aware Scheduling** - Discord timestamps, so everyone sees their own local time
- **Autocomplete Everywhere** - Schools, vehicles and equipment complete as you type
- **Graceful Errors** - Clear messages with a reference code instead of stack traces

---

## 📂 Project Structure

```
tankery-insanery-bot/
├── config/                     # config.js, permissions.js, matches.js, mtc.js, emojis.js
├── src/
│   ├── index.js                # Entry point (graceful shutdown, auto-seed on empty DB)
│   ├── console.js              # Server console commands (maintenance)
│   ├── commands/               # Slash commands: admin, help, loadout, match, referee, school, tank
│   ├── events/                 # ready, interactionCreate, guildCreate
│   ├── services/               # Permission, Audit, Settings, Maintenance, Tank, Equipment,
│   │                           # School, Loadout, MTC, Match, Backup, Validation
│   ├── ui/                     # Match wizard, lists, match view/export, panels, help center
│   ├── utils/                  # embeds, formatters, time, validators, logger
│   └── database/               # schema.sql, database.js, seed.js, migrations/
│
├── data/
│   └── seed/                   # mtc-ww2-loadout.json, tanks.txt, schools.json, equipment.json
│
├── scripts/                    # seed, reseed, deploy-commands, backup, validate, maintenance,
│                               # import-schools, import-tanks, fill-loadout, emoji-preview
├── tests/                      # node:test suites
├── backups/                    # Database backups (git-ignored)
├── Dockerfile
├── docker-compose.yml
└── start.sh                    # Pterodactyl / generic launcher
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18.17+ (22 recommended)
- A Discord server where you can create roles and invite a bot
- A [Discord application](https://discord.com/developers/applications) with a bot token

### Quick Start

```bash
# Install dependencies
npm install

# Create your configuration, then fill in the values
cp .env.example .env

# Create and populate the database (optional - the bot seeds an empty DB on first start)
npm run seed

# Register the slash commands in your server
npm run deploy

# Start the bot
npm start
```

### Discord Setup

1. Create an application in the Discord Developer Portal → **Bot** → copy the token (`DISCORD_TOKEN`) and the Application ID (`CLIENT_ID`).
2. Invite the bot with the scopes `bot applications.commands` and the permissions *View Channels, Send Messages, Embed Links, Attach Files*.
3. Enable **Developer Mode** in Discord and copy the server ID (`GUILD_ID`) and the two role IDs (`TI_ADMIN_ROLE_ID`, `TI_REFEREE_ROLE_ID`).
4. Optional channels: `MATCH_CHANNEL_ID` (announcements), `LOADOUT_CHANNEL_ID` (JSON files), `ADMIN_LOG_CHANNEL_ID` (audit mirror).

> Referees are made with the Discord role, not with a bot command.

---

## 🎮 Commands

| Command | Sub-commands | Who |
|---------|--------------|-----|
| `/help` | `topic` (optional page) | Everyone |
| `/match` | `create` `panel` `view` `list` `history` `edit` `finalize` `start` `finish` `cancel` `rounds` `schedule` `referee` `export` · `reopen` | Referee (own matches) · Admin (all, re-open) |
| `/school` | `list` `view` `tanks` · `add` `edit` `remove` `import` `export` · group `loadout`: `view` / `add-tank` `remove-tank` `set-quantity` `add-equipment` `remove-equipment` `add-camo` `remove-camo` `set-requirement` | Public* · Admin |
| `/tank` | `list` `search` `info` · `add` `edit` `remove` `enable` `disable` | Public · Admin |
| `/admin` | `panel` `validate-database` `config` `backup` `audit` · group `equipment`: `add` `edit` `remove` `base` | Admin |
| `/loadout` | Same loadout tools as `/school loadout …` | Admin |

\* `ALLOW_PUBLIC_LOADOUT_VIEW=false` restricts school loadout views to referees.

### Examples

```text
/match rounds match:match-0001 hawk:2 eagle:1
/match schedule match:match-0001 date:2026-10-18 time:7:30 PM timezone:America/Vancouver
/match referee match:match-0001 user:@someone
/help topic:Creating a match
```

### Match Life Cycle

| Status | Meaning |
|--------|---------|
| 📝 **Draft** | Being built in the wizard - edit freely |
| 🟢 **Ready** | Finalized, frozen and announced |
| 🔥 **In progress** | Started - record round wins |
| 🏁 **Completed** | Finished - winning school(s) announced |
| 🚫 **Cancelled** | Cancelled before completion |

### The Match Wizard

| Step | What you choose |
|------|-----------------|
| 1️⃣ Format | 1v1 up to 5v5, or **Custom** for uneven sides |
| 2️⃣ Hawk Republic | The school(s) playing for Hawk |
| 3️⃣ Eagle Federation | The school(s) playing for Eagle |
| 4️⃣ Rules | Tier limit, **full loadout** switch, date & time |
| 5️⃣ Tanks | Vehicles and amounts _(skipped when full loadout is on)_ |
| 6️⃣ Equipment | Basics for all teams + extra gear per school |
| 7️⃣ Review | Check everything, then **✅ Finalize** |

---

## 📦 MTC Loadout JSON

The export is exactly the MTC format. Each team only receives its **own** schools' vehicles and equipment, and an all-teams section carries the basics plus `RemoveVehicle`.

```json
{
  "WeaponClasses": {
    "Crewman": {
      "PassiveTools": [
        { "NameID": "Repair Torch", "Tier": 1 },
        { "NameID": "Binoculars", "Tier": 1 }
      ]
    },
    "Engineer": { "Primary": [{ "NameID": "RemoveVehicle", "Tier": 1 }] }
  },
  "Vehicles": {
    "GeneralLoadout": [],
    "TeamSpecificLoadout": {
      "Eagle Federation": [{ "NameID": "T-34-85", "Tier": 1, "LimitPerTeam": 1 }],
      "Hawk Republic": [{ "NameID": "Pz IV H", "Tier": 1, "LimitPerTeam": 1 }]
    }
  }
}
```

_(shortened - the real file contains every weapon class and slot)_

| Rule | Behaviour |
|------|-----------|
| 🔢 `LimitPerTeam` | The quantity the team may bring (never more than the school owns) |
| 🏷️ `Tier` | Always written as `1`, like the MTC example - tiers only limit what may be brought |
| 🤝 Merged schools | Schools on the same side are merged into one list |
| 🚫 Left out | Vehicles/equipment without a verified MTC NameID, disabled, over the tier limit or not allowed by era |

Vehicles from the school document with no MTC equivalent (Mark IV, Mark VI, A7V, M24 Chaffee, Centurion Mk.10, Karl-Gerät) stay in the school's inventory but are never put in a match.

### Quick-fill a template

```bash
npm run fill:loadout -- template.json --hawk "Koala Forest,Chi-Ha-Tan" --eagle "Anzio" --out result.json
```

---

## 🔧 Configuration

Every variable is validated at startup - missing or invalid values print a clear error and exit. See `.env.example`.

### Discord (required)

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application ID |
| `GUILD_ID` | Your server ID (the bot leaves other servers) |
| `TI_ADMIN_ROLE_ID` | Role ID of **TI Admin** |
| `TI_REFEREE_ROLE_ID` | Role ID of **TI Referee** |

### Optional channels

| Variable | Description |
|----------|-------------|
| `MATCH_CHANNEL_ID` | Live match announcements |
| `LOADOUT_CHANNEL_ID` | MTC JSON files posted at finalize |
| `ADMIN_LOG_CHANNEL_ID` | Mirror of the audit log |

### Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `./data/tankery.sqlite` | SQLite database file |
| `BACKUP_DIR` | `./backups` | Backup folder |
| `ENABLE_DATABASE_BACKUPS` | `true` | Automatic backups |
| `BACKUP_INTERVAL_HOURS` | `24` | Hours between backups |
| `BACKUP_KEEP` | `14` | Backups to keep |
| `LOG_LEVEL` | `info` | `fatal` … `trace`, `silent` |
| `MAX_MATCH_TEAMS` | `10` | Maximum teams in a match |
| `MAX_SCHOOLS_PER_MATCH` | `20` | Maximum schools in a match |
| `ALLOW_DUPLICATE_SCHOOLS` | `false` | Let a school play on both sides |
| `ALLOW_PUBLIC_LOADOUT_VIEW` | `true` | Everyone can open school loadouts |
| `ALLOW_REFEREE_EXPORT` | `true` | Referees can export MTC JSON |
| `ADMIN_IMPLIES_REFEREE` | `true` | Admins also count as referees |
| `EMBED_COLOR_HAWK` / `EMBED_COLOR_EAGLE` | `#EF4444` / `#3B82F6` | Team colours |

Runtime settings admins can change in Discord: `allowed_eras` (`/admin config`) and the default all-teams equipment (`/admin equipment base`).

### Custom Emojis

School and team emojis live in one file - `config/emojis.js`. To add or change one, edit a single line:

```js
[/viking/, E('Viking', 'EMOJI_ID_HERE')],
```

Run `npm run emojis:preview` to post one message with every emoji next to its school name, so you can check the pairing at a glance.

---

## 🗄️ Database

SQLite via **better-sqlite3** (WAL, foreign keys, transactions).

Tables: `schools`, `school_tanks`, `tanks`, `equipment`, `school_equipment`, `school_camos`, `matches`, `match_teams`, `match_vehicles`, `match_equipment`, `user_prefs`, `audit_logs`, `bot_config`

```bash
npm run seed        # starter vehicles + equipment + schools (idempotent)
npm run validate    # data-quality report (same as /admin validate-database)
npm run backup      # manual backup -> backups/tankery-YYYY-MM-DD-HH-mm-ss.sqlite
```

### Seed Data

| File | Contents |
|------|----------|
| `mtc-ww2-loadout.json` | The reference MTC WWII loadout (vehicle NameIDs + tiers) |
| `tanks.txt` | Catalogue built from it (`display_name \| name_id \| nation \| type \| era \| year \| aliases \| tier`). Aliases map school-document names to the right MTC vehicle (e.g. "T-34 (85)" → `T-34-85`, "M4A3E8" → `M4A2E8 Sherman`) |
| `schools.json` | The 19 schools with quantities, camouflage, decals, equipment and special requirements - the document's original wording is kept in the entry notes |
| `equipment.json` | MTC tools. Every tool is `Crewman/PassiveTools`; `RemoveVehicle` is `Engineer/Primary` |

`npm run seed` is idempotent and also marks any tool that was auto-created as "needs review" as verified when the seed has its real NameID. Load more schools with `npm run import:schools -- file.json [--replace]`.

### Upgrading from 1.0 (Side A / Side B)

The match tables changed, so an old database is not upgraded in place - the bot tells you so on start. **Stop the bot, then run once:**

```bash
npm run reseed     # copies the old database to backups/pre-reseed-*.sqlite, rebuilds it from data/seed
```

This also removes any vehicle or school that is not in the seed. Matches from 1.0 are kept only in that backup.

---

## 🔧 Maintenance Mode

Type in the bot's console (Pterodactyl console, `docker attach`, or a terminal):

```text
maintenance on Updating the loadouts   # every command/button replies "down for maintenance"; status -> Do Not Disturb
maintenance off
maintenance status
```

The state is stored, so a restart keeps the bot in maintenance. You can also run `npm run maintenance -- on "reason"` / `off` from a second shell - the running bot notices within 5 seconds.

---

## 🐳 Deployment

### Docker

```bash
cp .env.example .env   # fill in
docker compose up -d
docker compose exec tankery-bot npm run deploy   # register slash commands (once, and after command changes)
```

Volumes `tankery-data` (`/app/data`) and `tankery-backups` (`/app/backups`) persist the database and backups.

### Pterodactyl

1. Import/choose a standard **Node.js** egg (Node 18+; 22 recommended). Set the startup command to `npm start` (or `bash start.sh`, which installs dependencies, registers commands and starts the bot).
2. Upload the project files (without `node_modules`) to the server's file manager.
3. Create `.env` from `.env.example` (or set the same names as Pterodactyl environment variables).
4. Run `npm install` (or let `start.sh` do it), then start the server. Set `DEPLOY_COMMANDS_ON_START=false` to skip command registration on start.

### Registering Commands

Guild commands update instantly:

```bash
npm run deploy             # register
npm run deploy -- --clear  # remove all commands from the guild
```

---

## 🧪 Development

```bash
npm run dev     # node --watch
npm start       # production
npm test        # node --test tests/*.test.js
```

| Script | Description |
|--------|-------------|
| `npm run seed` / `reseed` | Create / rebuild the database from `data/seed` |
| `npm run deploy` | Register slash commands |
| `npm run validate` | Database quality report |
| `npm run backup` | Manual backup |
| `npm run maintenance` | Switch maintenance mode from a shell |
| `npm run import:schools` / `import:tanks` | Load more schools or vehicles |
| `npm run fill:loadout` | Fill an MTC JSON template with school tanks |
| `npm run emojis:preview` | Post every school emoji for a visual check |

**Test suites:** permissions, catalogue, loadout, match, mtc, validation, maintenance, time, emojis, help.

---

## 🔒 Security

- Role checks on **every** command and component interaction
- Guild lock - the bot leaves other servers
- Per-user rate limiting
- Wizard sessions are bound to their owner
- Parameterised SQL only, zod input validation
- Admin responses are ephemeral and all admin changes are audited
- Match JSON is frozen at finalize
- `.env` is git-ignored

---

## 🐛 Troubleshooting

### Startup Errors

**`Invalid configuration: …`**
- A required `.env` value is missing or malformed - the message lists every problem. Copy `.env.example` and fill in the Discord values.

**`better-sqlite3` fails to install**
- It needs a build toolchain (`python3`, `make`, `g++`) when no prebuilt binary matches your platform. The Docker image installs these for you.

### Runtime Issues

**Slash commands do not appear**
- Run `npm run deploy` (and again after command changes). Guild commands update instantly.

**"You need the TI Referee role"**
- Give the user the role whose ID is `TI_REFEREE_ROLE_ID`. Referees are made with the Discord role only.

**"Down for maintenance" on every command**
- Maintenance mode is on. Type `maintenance off` in the bot console.

**"This control is no longer active" / "The wizard expired"**
- The button belongs to an old message, or 30 minutes passed. Run the command again - drafts are saved, reopen one with `/match edit`.

**A vehicle is missing from the picker**
- It is blocked: none owned, disabled, era not allowed, no verified MTC NameID (⚠️) or above the tier limit. The wizard lists blocked vehicles with the reason; fix NameIDs with `/tank edit` or `/admin equipment edit`.

**Equipment is left out of the JSON**
- It is flagged "needs review". Run `npm run seed` (fixes known tools) or verify it with `/admin equipment edit`.

**Custom emojis show as plain text**
- Check the emoji ID in `config/emojis.js`, and that the emoji belongs to the server the bot is used in.

---

## 📜 License

This project is **proprietary software** - Copyright © Nan's Studio's, all rights reserved. The Tankery Insanery community may install, run and configure it for its own Discord server; see the [LICENSE](LICENSE) file for the full terms.

Girls und Panzer and MTC are trademarks of their respective owners. This is an unofficial community project and is not affiliated with or endorsed by them.

---

## 🙏 Acknowledgements

- [discord.js](https://discord.js.org/) - Discord API library
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Fast synchronous SQLite
- [zod](https://zod.dev/) - Input validation
- [pino](https://getpino.io/) - Logging
- [dotenv](https://github.com/motdotla/dotenv) - Environment configuration
- The Tankery Insanery community - Schools, loadouts and testing

---

<div align="center">

**[📖 In-Discord Help: `/help`](#-commands)** •
**[🔧 Configuration](#-configuration)** •
**[🐛 Troubleshooting](#-troubleshooting)**

<br/>

Made with ❤️ by [Nan's Studio's](LICENSE)

</div>