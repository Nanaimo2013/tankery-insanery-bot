/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const readline = require('node:readline');

const HELP = [
  'Console commands:',
  '  maintenance on [reason]   switch the bot to "down for maintenance" (status goes to Do Not Disturb)',
  '  maintenance off           bring the bot back',
  '  maintenance status        show the current state',
  '  help                      show this list',
].join('\n');

/** Run one console line. Returns the text to print (pure - easy to test). */
function runConsoleCommand(line, { maintenance }) {
  const parts = String(line ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [cmd, sub, ...rest] = parts;
  if (cmd.toLowerCase() === 'help' || cmd === '?') return HELP;
  if (['maintenance', 'maint'].includes(cmd.toLowerCase())) {
    const action = (sub ?? 'status').toLowerCase();
    if (['on', 'enable', 'start'].includes(action)) {
      const st = maintenance.enable(rest.join(' '));
      return `🛠️ Maintenance mode is ON${st.reason ? ` - ${st.reason}` : ''}. Every command now shows the maintenance message and the bot status is Do Not Disturb.`;
    }
    if (['off', 'disable', 'stop'].includes(action)) {
      if (!maintenance.isEnabled()) return 'Maintenance mode was already off.';
      maintenance.disable();
      return '✅ Maintenance mode is OFF. Commands work again.';
    }
    if (action === 'status') {
      const st = maintenance.status();
      return st.enabled ? `🛠️ Maintenance is ON since ${new Date(st.since * 1000).toISOString()}${st.reason ? ` - ${st.reason}` : ''}` : '✅ Maintenance is OFF.';
    }
  }
  return `Unknown command "${line.trim()}". Type "help".`;
}

/** Listen on stdin (works in a terminal, Docker -it and the Pterodactyl console). */
function startConsole(services, log) {
  if (process.stdin.destroyed) return null;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    try {
      const out = runConsoleCommand(line, services);
      if (out) console.log(out);
    } catch (err) {
      log.error({ err }, 'Console command failed');
    }
  });
  rl.on('error', () => {});
  process.stdin.on('error', () => {});
  return rl;
}

module.exports = { runConsoleCommand, startConsole, HELP };
