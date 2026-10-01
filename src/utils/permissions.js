/*
 * Tankery Insanery - MTC Match Manager
 * Copyright © Nan's Studio's
 * All rights reserved.
 */
'use strict';

const { getLogger } = require('./logger');

/** Simple per-user sliding-window rate limiter. */
class RateLimiter {
  constructor({ max = 8, windowMs = 10_000 } = {}) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** @returns {number} 0 if allowed, otherwise ms until the next allowed call */
  check(key, now = Date.now()) {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return this.windowMs - (now - arr[0]);
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.sweep(now);
    return 0;
  }

  sweep(now = Date.now()) {
    for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
  }
}

/** Wrap async handlers so one failure never crashes the process. */
async function safely(label, fn) {
  try {
    return await fn();
  } catch (err) {
    getLogger().error({ err }, `Unhandled error in ${label}`);
    return undefined;
  }
}

module.exports = { RateLimiter, safely };
