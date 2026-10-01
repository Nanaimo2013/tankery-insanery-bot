/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ValidationError } = require('../utils/validators');

const SEED_DIR = path.resolve(__dirname, '../../data/seed');

/** Parse the pipe-delimited vehicle list (see data/seed/tanks.txt). */
function parseTankText(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith('#')) return;
    const [display_name, nameIdRaw = '', nation, vehicle_type, era, year, aliases = '', tier = ''] = l.split('|').map((x) => x.trim());
    if (!display_name || !era) throw new ValidationError(`Line ${i + 1}: needs at least "display_name|name_id|nation|type|era".`);
    const verified = nameIdRaw.startsWith('*');
    const name_id = nameIdRaw.replace(/^\*/, '') || display_name;
    out.push({
      display_name,
      name_id,
      nation: nation || null,
      vehicle_type: vehicle_type || null,
      era: era.toUpperCase().replace(/[\s-]/g, '_'),
      year_introduced: year ? Number(year) : null,
      tier: tier ? Number(tier) : 1,
      aliases: aliases ? aliases.split(';').map((a) => a.trim()).filter(Boolean) : [],
      verified: Boolean(nameIdRaw),
    });
  });
  return out;
}

function readTankFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (file.toLowerCase().endsWith('.json')) {
    const j = JSON.parse(raw);
    return (Array.isArray(j) ? j : j.tanks ?? []).map((t) => ({ aliases: [], verified: false, ...t }));
  }
  return parseTankText(raw);
}

/** Insert catalogue vehicles that do not exist yet. Existing entries are left untouched. */
function importTanks(services, entries, actor = null) {
  const res = { created: 0, existing: 0, rejected: [] };
  services.db.transaction(() => {
    for (const e of entries) {
      if (services.tanks.findExact(e.display_name)) {
        res.existing += 1;
        continue;
      }
      try {
        services.tanks.add(
          { display_name: e.display_name, name_id: e.name_id || e.display_name, nation: e.nation, era: e.era, vehicle_type: e.vehicle_type, tier: e.tier ?? 1, year_introduced: e.year_introduced, notes: e.notes },
          null,
          { aliases: e.aliases ?? [], needsReview: !e.verified },
        );
        res.created += 1;
      } catch (err) {
        if (!err.userFacing) throw err;
        res.rejected.push(`${e.display_name}: ${err.message}`);
      }
    }
  })();
  services.audit.log(actor, { category: 'TANK', action: 'IMPORT_TANKS', target: `${res.created} created`, details: { targetLabel: 'Import', ...res, rejected: res.rejected.length } });
  return res;
}

function importEquipment(services, entries, actor = null) {
  const res = { created: 0, existing: 0 };
  services.db.transaction(() => {
    for (const e of entries) {
      if (services.equipment.find(e.name) || services.equipment.find(e.name_id)) {
        res.existing += 1;
        continue;
      }
      services.equipment.add(
        { name: e.name, name_id: e.name_id ?? e.name, class_name: e.class_name, slot: e.slot, tier: e.tier ?? 1, notes: e.verified ? null : 'Class/slot/NameID not verified - check against MTC.' },
        null,
        { aliases: e.aliases ?? [], needsReview: !e.verified },
      );
      res.created += 1;
    }
  })();
  services.audit.log(actor, { category: 'EQUIPMENT', action: 'IMPORT_EQUIPMENT', target: `${res.created} created`, details: { targetLabel: 'Import', ...res } });
  return res;
}

/** The MTC "basics" every match gets by default in the overall (all teams) section. */
const BASE_EQUIPMENT = ['Repair Torch', 'SprayCan', 'Binoculars', 'Fire Extinguisher', 'AmmoCrate', 'Jerrycan', 'Camo Net', 'Small Camo Net', 'Engineering Tool'];

/** Full starter database: vehicles, equipment, schools + loadouts. Safe to run repeatedly. */
function seedDatabase(services, { dir = SEED_DIR } = {}) {
  const tanks = importTanks(services, readTankFile(path.join(dir, 'tanks.txt')));
  const eqJson = JSON.parse(fs.readFileSync(path.join(dir, 'equipment.json'), 'utf8'));
  const equipment = importEquipment(services, eqJson.equipment);
  const schoolsJson = JSON.parse(fs.readFileSync(path.join(dir, 'schools.json'), 'utf8'));
  const schools = services.loadouts.importData(schoolsJson, { replace: false, actor: null });
  if (!services.settings.raw('base_equipment')) {
    const ids = BASE_EQUIPMENT.map((n) => services.equipment.find(n)?.id).filter(Boolean);
    services.settings.setBaseEquipmentIds(ids, null, 'seed');
  }
  return { tanks, equipment, schools };
}

module.exports = { BASE_EQUIPMENT, seedDatabase, importTanks, importEquipment, readTankFile, parseTankText, SEED_DIR };
