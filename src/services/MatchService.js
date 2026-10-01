/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { STATUS, SIDES } = require('../../config/matches');
const { withEmoji } = require('../../config/emojis');
const { ValidationError } = require('../utils/validators');
const { matchCode, formatLabel } = require('../utils/formatters');

class MatchValidationError extends ValidationError {
  constructor(errors) {
    super(errors.join('\n\n'));
    this.errors = errors;
  }
}

const MAX_ROUNDS = 99;

/**
 * Draft shape used by the wizard and persistence:
 * { id?, refereeId, hawkCount, eagleCount, hawk:[schoolId], eagle:[schoolId],
 *   tierCap: number|null, fullLoadout: boolean, scheduledAt: number|null, timezone: string|null,
 *   vehicles: { H0: { [tankId]: qty }, E0: {...} },
 *   equipment: [equipmentId]            // overall ("the basics") - given to every team
 *   teamEquipment: { H0: [equipmentId] } // extra equipment for one team
 * }
 * Team keys are `${H|E}${index}` so the same school may appear twice when duplicates are allowed.
 */
class MatchService {
  constructor(db, { config, schools, tanks, equipment, loadouts, mtc, permissions, settings, audit }) {
    Object.assign(this, { db, config, schools, tanks, equipment, loadouts, mtc, permissions, settings, audit });
  }

  // ------------------------------------------------------------------ keys
  static sideList(draft, code) {
    return code === 'H' ? draft.hawk : draft.eagle;
  }

  static teamKeys(draft) {
    return [...draft.hawk.map((_, i) => `H${i}`), ...draft.eagle.map((_, i) => `E${i}`)];
  }

  static schoolForKey(draft, key) {
    return MatchService.sideList(draft, key[0])[Number(key.slice(1))];
  }

  newDraft(refereeId, hawkCount = 1, eagleCount = 1) {
    return {
      refereeId, hawkCount, eagleCount, hawk: [], eagle: [], tierCap: null, fullLoadout: false,
      scheduledAt: null, timezone: null, vehicles: {}, equipment: this.settings.getBaseEquipmentIds(), teamEquipment: {},
    };
  }

  validateTeamCounts(h, e) {
    const max = this.config.matches.maxTeams;
    for (const [label, n] of [['Hawk Republic', h], ['Eagle Federation', e]]) {
      if (!Number.isInteger(n) || n < 1 || n > max) throw new ValidationError(`${label} must have between 1 and ${max} school(s).`);
    }
    if (h + e > this.config.matches.maxSchools) throw new ValidationError(`A match can have at most ${this.config.matches.maxSchools} schools in total.`);
  }

  // ------------------------------------------------------------------ defaults / helpers
  /** Equipment a school owns that MTC can actually receive (enabled + verified NameID). */
  schoolGear(schoolId) {
    return this.loadouts.getLoadout(schoolId).equipment.filter((e) => e.enabled && !e.needs_review);
  }

  /** Give every team its school's own equipment (the right equipment to the right team). */
  applyTeamEquipmentDefaults(draft) {
    draft.teamEquipment = {};
    for (const key of MatchService.teamKeys(draft)) {
      const schoolId = MatchService.schoolForKey(draft, key);
      draft.teamEquipment[key] = schoolId ? this.schoolGear(schoolId).map((e) => e.id) : [];
    }
    return draft;
  }

  /** "Full loadout": every school brings everything it owns that is allowed (tier limit, valid MTC NameID...). */
  applyFullLoadout(draft) {
    draft.vehicles = {};
    const used = new Map();
    for (const key of MatchService.teamKeys(draft)) {
      const schoolId = MatchService.schoolForKey(draft, key);
      if (!schoolId) continue;
      const picks = {};
      for (const t of this.loadouts.availableForMatch(schoolId, { tierCap: draft.tierCap })) {
        const left = t.quantity - (used.get(`${schoolId}:${t.tank_id}`) ?? 0);
        if (left < 1) continue;
        picks[t.tank_id] = left;
        used.set(`${schoolId}:${t.tank_id}`, t.quantity);
      }
      draft.vehicles[key] = picks;
    }
    return draft;
  }

  /** Drop picks that no longer satisfy the tier limit (used when the limit is lowered). */
  pruneToTier(draft) {
    for (const [key, picks] of Object.entries(draft.vehicles)) {
      for (const tankId of Object.keys(picks)) {
        const t = this.tanks.get(Number(tankId));
        if (!t || (draft.tierCap !== null && t.tier > draft.tierCap)) delete picks[tankId];
      }
    }
    return draft;
  }

  // ------------------------------------------------------------------ validation
  /** Full validation used before finalizing. Returns { errors, warnings }. */
  validate(draft, { member } = {}) {
    const errors = [];
    const warnings = [];
    if (member && !this.permissions.isReferee(member)) errors.push('❌ You need the TI Referee role to create or finalize matches.');

    try {
      this.validateTeamCounts(draft.hawkCount, draft.eagleCount);
    } catch (e) {
      errors.push(e.message);
    }
    if (draft.tierCap !== null && !(Number.isInteger(draft.tierCap) && draft.tierCap >= 1)) errors.push('The tier limit must be a whole number from 1 up, or no limit.');
    if (!draft.hawk.length) errors.push('Hawk Republic has no school.');
    if (!draft.eagle.length) errors.push('Eagle Federation has no school.');
    if (draft.hawk.length !== draft.hawkCount) errors.push(`Hawk Republic is set to ${draft.hawkCount} school(s) but ${draft.hawk.length} are selected.`);
    if (draft.eagle.length !== draft.eagleCount) errors.push(`Eagle Federation is set to ${draft.eagleCount} school(s) but ${draft.eagle.length} are selected.`);

    const all = [...draft.hawk, ...draft.eagle];
    if (!this.config.matches.allowDuplicateSchools) {
      const seen = new Set();
      for (const id of all) {
        if (seen.has(id)) errors.push(`${this.schools.get(id)?.name ?? `School #${id}`} is selected more than once.`);
        seen.add(id);
      }
    }
    if (draft.scheduledAt && draft.scheduledAt < Math.floor(Date.now() / 1000) - 3600) warnings.push('The scheduled time is in the past.');

    const allowedEras = this.settings.getAllowedEras();
    const used = new Map(); // `${schoolId}:${tankId}` -> requested qty (across duplicate teams)
    for (const key of MatchService.teamKeys(draft)) {
      const side = SIDES[key[0]];
      const schoolId = MatchService.schoolForKey(draft, key);
      const school = this.schools.get(schoolId);
      if (!school) {
        errors.push(`School #${schoolId} does not exist.`);
        continue;
      }
      if (!school.enabled) errors.push(`${school.name} is disabled.`);
      const picks = Object.entries(draft.vehicles[key] ?? {}).filter(([, q]) => q > 0);
      if (!picks.length) errors.push(`${school.name} (${side.name}) has no vehicles selected.`);
      for (const [tankIdStr, qty] of picks) {
        const tank = this.tanks.get(Number(tankIdStr));
        if (!tank) {
          errors.push(`Vehicle #${tankIdStr} (${school.name}) does not exist.`);
          continue;
        }
        if (!tank.enabled) errors.push(`${tank.display_name} is disabled and cannot be used.`);
        if (tank.needs_review) errors.push(`${tank.display_name} has no verified MTC NameID, so it cannot be put in a match loadout.`);
        if (!allowedEras.includes(tank.era)) errors.push(`${tank.display_name} (${formatLabel(tank.era)}) is not in the permitted eras.`);
        if (draft.tierCap !== null && tank.tier > draft.tierCap) errors.push(`${tank.display_name} is tier ${tank.tier}, above this match's limit of tier ${draft.tierCap}.`);
        if (!Number.isInteger(qty) || qty < 1) {
          errors.push(`${tank.display_name}: quantity must be a positive whole number.`);
          continue;
        }
        const k = `${schoolId}:${tank.id}`;
        used.set(k, { school, tank, qty: (used.get(k)?.qty ?? 0) + qty });
      }
      const gearIds = draft.teamEquipment?.[key] ?? [];
      for (const id of gearIds) this.checkEquipment(id, errors);
    }
    for (const { school, tank, qty } of used.values()) {
      const have = this.loadouts.getEntry(school.id, tank.id)?.quantity ?? 0;
      if (qty > have) {
        errors.push(`❌ Match cannot be finalized.\n\n${school.name} only has ${have} ${tank.display_name} vehicle${have === 1 ? '' : 's'} available.\n\nRequested:\n${qty}\n\nAvailable:\n${have}`);
      }
    }
    for (const id of draft.equipment ?? []) this.checkEquipment(id, errors);

    for (const id of new Set(all)) {
      const s = this.schools.get(id);
      if (!s) continue;
      for (const e of this.loadouts.getLoadout(id).equipment) {
        if (e.needs_review) warnings.push(`${s.name}: ${e.name} has no verified MTC NameID and is left out of the JSON.`);
      }
      if (s.special_requirements?.length) warnings.push(`${s.name}: ${s.special_requirements.join(' / ')}`);
    }
    for (const key of MatchService.teamKeys(draft)) {
      const schoolId = MatchService.schoolForKey(draft, key);
      for (const [tankId, qty] of Object.entries(draft.vehicles[key] ?? {})) {
        if (!(qty > 0)) continue;
        const e = this.loadouts.getEntry(schoolId, Number(tankId));
        const tank = this.tanks.get(Number(tankId));
        if (e?.special_requirements && tank) warnings.push(`${tank.display_name}: ${e.special_requirements}`);
      }
    }
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }

  checkEquipment(id, errors) {
    const e = this.equipment.get(id);
    if (!e) errors.push(`Equipment #${id} does not exist.`);
    else if (!e.enabled) errors.push(`${e.name} is disabled.`);
    else if (e.needs_review) errors.push(`${e.name} has no verified MTC NameID and cannot be put in a match loadout.`);
  }

  // ------------------------------------------------------------------ hydrate / build
  /** Expand ids into rows so embeds / MTC export can use them. */
  hydrate(draft) {
    const byId = (ids) => (ids ?? []).map((id) => this.equipment.get(id)).filter(Boolean);
    const teams = MatchService.teamKeys(draft).map((key) => {
      const school = this.schools.get(MatchService.schoolForKey(draft, key));
      const camos = school ? this.loadouts.getLoadout(school.id).camos : [];
      const vehicles = Object.entries(draft.vehicles[key] ?? {})
        .filter(([, q]) => q > 0)
        .map(([tankId, quantity]) => ({ tank: this.tanks.get(Number(tankId)), quantity }))
        .filter((v) => v.tank)
        .sort((a, b) => a.tank.display_name.localeCompare(b.tank.display_name));
      return { key, side: key[0], sideInfo: SIDES[key[0]], school, camos, vehicles, equipment: byId(draft.teamEquipment?.[key]) };
    });
    return {
      id: draft.id,
      code: draft.id ? matchCode(draft.id) : '(unsaved)',
      status: draft.status ?? STATUS.DRAFT,
      refereeId: draft.refereeId,
      hawkCount: draft.hawkCount,
      eagleCount: draft.eagleCount,
      tierCap: draft.tierCap ?? null,
      fullLoadout: Boolean(draft.fullLoadout),
      scheduledAt: draft.scheduledAt ?? null,
      timezone: draft.timezone ?? null,
      hawkWins: draft.hawkWins ?? 0,
      eagleWins: draft.eagleWins ?? 0,
      winner: draft.winner ?? null,
      teams,
      equipment: byId(draft.equipment),
    };
  }

  /** The exact MTC JSON object for a draft/match. */
  buildLoadout(draft) {
    const h = this.hydrate(draft);
    return this.mtc.buildLoadout({
      teams: h.teams
        .filter((t) => t.school)
        .map((t) => ({
          side: t.side,
          vehicles: t.vehicles.map((v) => ({ name_id: v.tank.name_id, quantity: v.quantity })),
          equipment: t.equipment.filter((e) => e.enabled && !e.needs_review),
        })),
      overall: h.equipment.filter((e) => e.enabled && !e.needs_review),
    });
  }

  /** "School (Hawk Republic) vs School (Eagle Federation)". */
  title(draft) {
    const names = (ids) => ids.map((id) => this.schools.get(id)?.name ?? '?').join(' + ') || '?';
    return `${names(draft.hawk)} (${SIDES.H.name}) vs ${names(draft.eagle)} (${SIDES.E.name})`;
  }

  schoolNames(draft, code, { rich = false } = {}) {
    return MatchService.sideList(draft, code).map((id) => { const s = this.schools.get(id); return s ? (rich ? withEmoji(s) : s.name) : '?'; }).join(' + ') || '?';
  }

  /** Like title() but with each school's emoji and the team emojis (for embeds / messages only). */
  titleRich(draft) {
    return `${this.schoolNames(draft, 'H', { rich: true })} (${SIDES.H.emoji} ${SIDES.H.name}) vs ${this.schoolNames(draft, 'E', { rich: true })} (${SIDES.E.emoji} ${SIDES.E.name})`;
  }

  /** Winner summary for a match: { code: 'H'|'E'|'DRAW'|null, text } (live leader while ACTIVE). */
  result(draft, { rich = false } = {}) {
    const h = draft.hawkWins ?? 0;
    const e = draft.eagleWins ?? 0;
    const code = h > e ? 'H' : e > h ? 'E' : 'DRAW';
    const score = `${h} - ${e}`;
    const final = draft.status === STATUS.COMPLETED;
    if (code === 'DRAW') return { code: final ? 'DRAW' : null, score, text: final ? `Draw (${score})` : `Tied ${score}` };
    const label = `${this.schoolNames(draft, code, { rich })} (${rich ? `${SIDES[code].emoji} ` : ''}${SIDES[code].name})`;
    return { code: final ? code : null, leader: code, score, text: final ? `🏆 ${label} won ${score}` : `${label} leads ${score}` };
  }

  // ------------------------------------------------------------------ persistence
  getRow(id) {
    return this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id) ?? null;
  }

  /** Load a stored match as a draft-shaped object (plus row fields). */
  load(id) {
    const row = this.getRow(id);
    if (!row) return null;
    const teams = this.db.prepare('SELECT * FROM match_teams WHERE match_id = ? ORDER BY side, slot').all(id);
    const draft = {
      id: row.id, status: row.status, refereeId: row.referee_id,
      hawkCount: row.hawk_count, eagleCount: row.eagle_count,
      tierCap: row.tier_cap, fullLoadout: Boolean(row.full_loadout),
      scheduledAt: row.scheduled_at, timezone: row.timezone,
      hawkWins: row.hawk_wins, eagleWins: row.eagle_wins, winner: row.winner,
      announceChannelId: row.announce_channel_id, announceMessageId: row.announce_message_id,
      loadoutChannelId: row.loadout_channel_id, loadoutMessageId: row.loadout_message_id,
      loadoutJson: row.loadout_json, createdAt: row.created_at, finalizedAt: row.finalized_at,
      hawk: [], eagle: [], vehicles: {}, equipment: [], teamEquipment: {},
    };
    const keyById = new Map();
    for (const t of teams) {
      (t.side === 'H' ? draft.hawk : draft.eagle)[t.slot] = t.school_id;
      keyById.set(t.id, `${t.side}${t.slot}`);
    }
    for (const v of this.db.prepare('SELECT * FROM match_vehicles WHERE match_id = ?').all(id)) {
      (draft.vehicles[keyById.get(v.team_id)] ??= {})[v.tank_id] = v.quantity;
    }
    for (const e of this.db.prepare('SELECT scope, equipment_id FROM match_equipment WHERE match_id = ? ORDER BY id').all(id)) {
      if (e.scope === 'ALL') draft.equipment.push(e.equipment_id);
      else (draft.teamEquipment[e.scope] ??= []).push(e.equipment_id);
    }
    return draft;
  }

  /** Persist a DRAFT (insert or update) in a single transaction. */
  save(draft, actor = {}) {
    this.validateTeamCounts(draft.hawkCount, draft.eagleCount);
    if (draft.id) {
      const row = this.getRow(draft.id);
      if (!row) throw new ValidationError('That match no longer exists.');
      if (row.status !== STATUS.DRAFT) throw new ValidationError(`${matchCode(row.id)} is ${row.status} and cannot be edited. An admin can re-open it.`);
      if (actor.member && !this.permissions.canManageMatch(actor.member, actor.id, row)) throw new ValidationError('You can only edit matches you created.');
    }
    for (const id of [...draft.hawk, ...draft.eagle]) if (!this.schools.get(id)) throw new ValidationError(`School #${id} does not exist.`);

    const tx = this.db.transaction(() => {
      let id = draft.id;
      const fields = [draft.hawkCount, draft.eagleCount, draft.tierCap ?? null, draft.fullLoadout ? 1 : 0, draft.scheduledAt ?? null, draft.timezone ?? null];
      if (id) {
        this.db
          .prepare("UPDATE matches SET hawk_count=?, eagle_count=?, tier_cap=?, full_loadout=?, scheduled_at=?, timezone=?, updated_at=datetime('now') WHERE id=?")
          .run(...fields, id);
        for (const t of ['match_vehicles', 'match_equipment', 'match_teams']) this.db.prepare(`DELETE FROM ${t} WHERE match_id = ?`).run(id);
      } else {
        id = this.db
          .prepare('INSERT INTO matches (status, referee_id, hawk_count, eagle_count, tier_cap, full_loadout, scheduled_at, timezone) VALUES (?,?,?,?,?,?,?,?)')
          .run(STATUS.DRAFT, draft.refereeId, ...fields).lastInsertRowid;
      }
      const insTeam = this.db.prepare('INSERT INTO match_teams (match_id, side, slot, school_id) VALUES (?,?,?,?)');
      const insVeh = this.db.prepare('INSERT INTO match_vehicles (match_id, team_id, school_id, tank_id, name_id, tier, quantity) VALUES (?,?,?,?,?,?,?)');
      for (const key of MatchService.teamKeys(draft)) {
        const schoolId = MatchService.schoolForKey(draft, key);
        const teamId = insTeam.run(id, key[0], Number(key.slice(1)), schoolId).lastInsertRowid;
        for (const [tankId, qty] of Object.entries(draft.vehicles[key] ?? {})) {
          if (!(qty > 0)) continue;
          const tank = this.tanks.get(Number(tankId));
          if (!tank) throw new ValidationError(`Vehicle #${tankId} does not exist.`);
          insVeh.run(id, teamId, schoolId, tank.id, tank.name_id, tank.tier, qty);
        }
      }
      const insEq = this.db.prepare('INSERT OR IGNORE INTO match_equipment (match_id, scope, equipment_id, name_id, class_name, slot, tier) VALUES (?,?,?,?,?,?,?)');
      const addEq = (scope, eid) => {
        const e = this.equipment.get(eid);
        if (!e) throw new ValidationError(`Equipment #${eid} does not exist.`);
        insEq.run(id, scope, e.id, e.name_id, e.class_name, e.slot, e.tier);
      };
      for (const eid of draft.equipment ?? []) addEq('ALL', eid);
      for (const key of MatchService.teamKeys(draft)) for (const eid of draft.teamEquipment?.[key] ?? []) addEq(key, eid);
      return id;
    });
    return this.load(tx());
  }

  // ------------------------------------------------------------------ lifecycle
  /** Validate, freeze the MTC JSON and mark READY. */
  finalize(id, actor = {}) {
    const row = this.getRow(id);
    if (!row) throw new ValidationError('That match does not exist.');
    if (row.status !== STATUS.DRAFT) throw new ValidationError(`${matchCode(id)} is already ${row.status}.`);
    if (actor.member && !this.permissions.canManageMatch(actor.member, actor.id, row)) throw new ValidationError('You can only finalize matches you created.');
    const draft = this.load(id);
    const { errors } = this.validate(draft, { member: actor.member });
    if (errors.length) throw new MatchValidationError(errors);
    const json = this.buildLoadout(draft);
    const shape = this.mtc.validateShape(json);
    if (!shape.valid) throw new MatchValidationError([`Generated JSON failed MTC structure validation: ${shape.errors.join('; ')}`]);
    this.db.prepare("UPDATE matches SET status = ?, loadout_json = ?, finalized_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(STATUS.READY, this.mtc.serialize(json), id);
    this.audit?.log({ id: actor.id, tag: actor.tag }, { category: 'MATCH', action: 'FINALIZE_MATCH', target: matchCode(id), details: { targetLabel: 'Match' } });
    return this.load(id);
  }

  assertCanManage(row, actor, { adminOnly = false } = {}) {
    if (!row) throw new ValidationError('That match does not exist.');
    if (adminOnly && actor.member && !this.permissions.isAdmin(actor.member)) throw new ValidationError('Only a TI Admin can do that.');
    if (!adminOnly && actor.member && !this.permissions.canManageMatch(actor.member, actor.id, row)) throw new ValidationError('You can only manage matches you created (or are assigned to as referee).');
  }

  transition(id, to, actor = {}, { allowedFrom, adminOnly = false } = {}) {
    const row = this.getRow(id);
    this.assertCanManage(row, actor, { adminOnly });
    if (!allowedFrom.includes(row.status)) throw new ValidationError(`${matchCode(id)} is ${row.status}; it cannot move to ${to}.`);
    let extra = '';
    if (to === STATUS.DRAFT) extra = ', loadout_json = NULL, finalized_at = NULL, started_at = NULL, completed_at = NULL, hawk_wins = 0, eagle_wins = 0, winner = NULL';
    if (to === STATUS.ACTIVE) extra = ", started_at = datetime('now')";
    if (to === STATUS.COMPLETED) {
      const code = row.hawk_wins > row.eagle_wins ? 'H' : row.eagle_wins > row.hawk_wins ? 'E' : 'DRAW';
      extra = `, completed_at = datetime('now'), winner = '${code}'`;
    }
    this.db.prepare(`UPDATE matches SET status = ?${extra}, updated_at = datetime('now') WHERE id = ?`).run(to, id);
    this.audit?.log({ id: actor.id, tag: actor.tag }, { category: 'MATCH', action: `${row.status}_TO_${to}`, target: matchCode(id), details: { targetLabel: 'Match' } });
    return this.load(id);
  }

  cancel(id, actor) {
    return this.transition(id, STATUS.CANCELLED, actor, { allowedFrom: [STATUS.DRAFT, STATUS.READY, STATUS.ACTIVE] });
  }
  start(id, actor) {
    return this.transition(id, STATUS.ACTIVE, actor, { allowedFrom: [STATUS.READY] });
  }
  /** Finish a match: the side with more round wins is the winner (equal = draw). */
  complete(id, actor) {
    return this.transition(id, STATUS.COMPLETED, actor, { allowedFrom: [STATUS.ACTIVE] });
  }
  /** Admin-only: re-open a finalized/cancelled match for editing (round wins are reset). */
  reopen(id, actor) {
    return this.transition(id, STATUS.DRAFT, actor, { allowedFrom: [STATUS.READY, STATUS.ACTIVE, STATUS.CANCELLED], adminOnly: true });
  }

  // ------------------------------------------------------------------ rounds / schedule / referee
  /** Set round wins. Allowed while ACTIVE, or after completion to correct the score (the winner is recalculated). */
  setRounds(id, { hawk, eagle }, actor = {}) {
    const row = this.getRow(id);
    this.assertCanManage(row, actor);
    if (![STATUS.ACTIVE, STATUS.COMPLETED].includes(row.status)) throw new ValidationError(`Round wins can be recorded once ${matchCode(id)} has started (it is ${row.status}).`);
    const h = hawk ?? row.hawk_wins;
    const e = eagle ?? row.eagle_wins;
    for (const n of [h, e]) if (!Number.isInteger(n) || n < 0 || n > MAX_ROUNDS) throw new ValidationError(`Round wins must be whole numbers from 0 to ${MAX_ROUNDS}.`);
    const winner = row.status === STATUS.COMPLETED ? (h > e ? 'H' : e > h ? 'E' : 'DRAW') : null;
    this.db.prepare("UPDATE matches SET hawk_wins = ?, eagle_wins = ?, winner = ?, updated_at = datetime('now') WHERE id = ?").run(h, e, winner, id);
    this.audit?.log({ id: actor.id, tag: actor.tag }, { category: 'MATCH', action: 'SET_ROUNDS', target: matchCode(id), details: { targetLabel: 'Match', hawk: h, eagle: e } });
    return this.load(id);
  }

  adjustRound(id, side, delta, actor = {}) {
    const row = this.getRow(id);
    if (!row) throw new ValidationError('That match does not exist.');
    const h = row.hawk_wins + (side === 'H' ? delta : 0);
    const e = row.eagle_wins + (side === 'E' ? delta : 0);
    return this.setRounds(id, { hawk: Math.max(0, h), eagle: Math.max(0, e) }, actor);
  }

  /** Set (or clear with epoch = null) the match time. Stored as UTC; Discord shows it in each viewer's timezone. */
  setSchedule(id, { epoch, zoneLabel = null }, actor = {}) {
    const row = this.getRow(id);
    this.assertCanManage(row, actor);
    if (![STATUS.DRAFT, STATUS.READY, STATUS.ACTIVE].includes(row.status)) throw new ValidationError(`${matchCode(id)} is ${row.status}; its time can no longer be changed.`);
    this.db.prepare("UPDATE matches SET scheduled_at = ?, timezone = ?, updated_at = datetime('now') WHERE id = ?").run(epoch ?? null, epoch ? zoneLabel : null, id);
    this.audit?.log({ id: actor.id, tag: actor.tag }, { category: 'MATCH', action: 'SET_SCHEDULE', target: matchCode(id), details: { targetLabel: 'Match', epoch: epoch ?? 'cleared' } });
    return this.load(id);
  }

  /** Hand a match to another referee. The new referee must hold the TI Referee (or Admin) role. */
  changeReferee(id, newRefereeId, actor = {}, { targetMember } = {}) {
    const row = this.getRow(id);
    this.assertCanManage(row, actor);
    if ([STATUS.COMPLETED, STATUS.CANCELLED].includes(row.status)) throw new ValidationError(`${matchCode(id)} is ${row.status}; its referee can no longer be changed.`);
    if (targetMember !== undefined && !this.permissions.isReferee(targetMember)) throw new ValidationError('That person does not have the TI Referee role.');
    if (row.referee_id === newRefereeId) throw new ValidationError('That person is already the referee of this match.');
    this.db.prepare("UPDATE matches SET referee_id = ?, updated_at = datetime('now') WHERE id = ?").run(newRefereeId, id);
    this.audit?.log({ id: actor.id, tag: actor.tag }, { category: 'MATCH', action: 'CHANGE_REFEREE', target: matchCode(id), details: { targetLabel: 'Match', from: row.referee_id, to: newRefereeId } });
    return this.load(id);
  }

  // ------------------------------------------------------------------ announcement bookkeeping
  setAnnouncement(id, { channelId, messageId }) {
    this.db.prepare('UPDATE matches SET announce_channel_id = ?, announce_message_id = ? WHERE id = ?').run(channelId ?? null, messageId ?? null, id);
  }
  setLoadoutMessage(id, { channelId, messageId }) {
    this.db.prepare('UPDATE matches SET loadout_channel_id = ?, loadout_message_id = ? WHERE id = ?').run(channelId ?? null, messageId ?? null, id);
  }

  // ------------------------------------------------------------------ queries
  list({ status, statuses, refereeId, schoolId, limit = 25, offset = 0 } = {}) {
    const where = [];
    const args = [];
    if (status) (where.push('m.status = ?'), args.push(status));
    if (statuses?.length) (where.push(`m.status IN (${statuses.map(() => '?').join(',')})`), args.push(...statuses));
    if (refereeId) (where.push('m.referee_id = ?'), args.push(refereeId));
    if (schoolId) (where.push('EXISTS (SELECT 1 FROM match_teams mt WHERE mt.match_id = m.id AND mt.school_id = ?)'), args.push(schoolId));
    const sql = `SELECT m.* FROM matches m ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.id DESC LIMIT ? OFFSET ?`;
    return this.db.prepare(sql).all(...args, limit, offset);
  }

  history({ schoolId, limit = 100 } = {}) {
    return this.list({ statuses: [STATUS.COMPLETED, STATUS.CANCELLED], schoolId, limit });
  }

  /** Exact MTC JSON for a match: frozen copy once finalized, otherwise generated live. */
  exportJson(id) {
    const row = this.getRow(id);
    if (!row) throw new ValidationError('That match does not exist.');
    if (row.loadout_json) return row.loadout_json;
    return this.mtc.serialize(this.buildLoadout(this.load(id)));
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  }
}

module.exports = { MatchService, MatchValidationError, MAX_ROUNDS };
