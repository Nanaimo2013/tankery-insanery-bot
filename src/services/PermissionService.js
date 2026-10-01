/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { LEVELS, ACTIONS } = require('../../config/permissions');

/**
 * Server-side permission checks. Works with discord.js GuildMember objects
 * (member.roles.cache) as well as raw API members (member.roles = [ids]).
 */
class PermissionService {
  constructor(config) {
    this.config = config;
  }

  hasRole(member, roleId) {
    if (!member || !roleId) return false;
    const roles = member.roles;
    if (!roles) return false;
    if (roles.cache && typeof roles.cache.has === 'function') return roles.cache.has(roleId);
    if (Array.isArray(roles)) return roles.includes(roleId);
    if (typeof roles.has === 'function') return roles.has(roleId);
    return false;
  }

  isAdmin(member) {
    return this.hasRole(member, this.config.roles.admin);
  }

  isReferee(member) {
    if (this.hasRole(member, this.config.roles.referee)) return true;
    return this.config.access.adminImpliesReferee && this.isAdmin(member);
  }

  levelOf(member) {
    if (this.isAdmin(member)) return LEVELS.ADMIN;
    if (this.isReferee(member)) return LEVELS.REFEREE;
    return LEVELS.PUBLIC;
  }

  /** Resolve the level an action needs (unknown actions require ADMIN). */
  requiredLevel(action) {
    const rule = ACTIONS[action];
    if (rule === undefined) return LEVELS.ADMIN;
    if (rule === 'PUBLIC_LOADOUT') return this.config.access.publicLoadoutView ? LEVELS.PUBLIC : LEVELS.REFEREE;
    return LEVELS[rule];
  }

  can(member, action) {
    const need = this.requiredLevel(action);
    if (need === LEVELS.PUBLIC) return true;
    if (need === LEVELS.REFEREE) return this.isReferee(member);
    return this.isAdmin(member);
  }

  /** Interactions must come from the configured guild. */
  isCorrectGuild(guildId) {
    return Boolean(guildId) && guildId === this.config.discord.guildId;
  }

  /** Admins may manage any match; referees only the ones they created. */
  canManageMatch(member, userId, match) {
    if (this.isAdmin(member)) return true;
    return this.isReferee(member) && match?.referee_id === userId;
  }

  canExportMatch(member) {
    if (this.isAdmin(member)) return true;
    return this.isReferee(member) && this.config.access.refereeExport;
  }
}

module.exports = { PermissionService };
