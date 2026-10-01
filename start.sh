#!/usr/bin/env bash
# Tankery Insanery - MTC Match Manager - Copyright © Nan's Studio's. All rights reserved.
# Pterodactyl / generic launcher: installs dependencies if missing, registers commands, starts the bot.
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "[start.sh] Installing dependencies..."
  npm install --omit=dev --no-audit --no-fund
fi

if [ ! -f .env ] && [ -z "${DISCORD_TOKEN:-}" ]; then
  echo "[start.sh] No .env file and no DISCORD_TOKEN variable found - copy .env.example to .env first."
  exit 1
fi

if [ "${DEPLOY_COMMANDS_ON_START:-true}" = "true" ]; then
  echo "[start.sh] Registering slash commands..."
  npm run deploy || echo "[start.sh] Command registration failed (continuing)."
fi

exec npm start
