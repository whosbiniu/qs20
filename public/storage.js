// Browser storage with a budget. Cached copies of market data ("stash:" keys) are the only thing that grows with use,
// so they are kept in a least-recently-used list and trimmed to STASH_BUDGET bytes. Everything else (settings,
// drawings) goes through Store.set, which frees stash space when the browser reports the quota is full instead of
// failing silently. Loaded first on every page.
(function (root) {
  'use strict';
  const PREFIX = 'stash:', INDEX = 'stash-index', STASH_BUDGET = 1500000, STASH_MAX = 40;
  const ls = (() => { try { return root.localStorage; } catch { return null; } })();
  const isQuota = e => e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
  function readIndex() {
    try { const i = JSON.parse(ls.getItem(INDEX) || '{}'); return i && typeof i === 'object' ? i : {}; } catch { return {}; }
  }
  function writeIndex(index) { try { ls.setItem(INDEX, JSON.stringify(index)); } catch {} }
  // Strictly newer than every entry, so a read and a write in the same millisecond still keep their order.
  const stamp = index => Object.values(index).reduce((t, e) => Math.max(t, (e.t || 0) + 1), Date.now());
  // Drop stash entries, oldest first, until the stash fits the budget (or until `need` bytes are freed).
  function trim(index, need = 0) {
    const keys = Object.keys(index).sort((a, b) => index[a].t - index[b].t);
    let total = keys.reduce((s, k) => s + index[k].n, 0), freed = 0;
    while (keys.length && (total > STASH_BUDGET || keys.length > STASH_MAX || freed < need)) {
      const k = keys.shift();
      freed += index[k].n; total -= index[k].n;
      try { ls.removeItem(PREFIX + k); } catch {}
      delete index[k];
    }
    return freed;
  }
  // Also adopt stash keys written before this module existed, so they are counted and can be trimmed.
  function adopt(index) {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (key && key.startsWith(PREFIX) && !index[key.slice(PREFIX.length)]) index[key.slice(PREFIX.length)] = { t: 0, n: (ls.getItem(key) || '').length };
    }
  }

  const Stash = {
    get(key) {
      if (!ls) return null;
      try {
        const raw = ls.getItem(PREFIX + key);
        if (raw === null) return null;
        const index = readIndex();
        if (index[key]) { index[key].t = stamp(index); writeIndex(index); }
        return JSON.parse(raw);
      } catch { return null; }
    },
    put(key, value) {
      if (!ls) return false;
      let text;
      try { text = JSON.stringify(value); } catch { return false; }
      if (text.length > STASH_BUDGET / 3) return false;   // never let one copy crowd out the rest
      const index = readIndex();
      index[key] = { t: stamp(index), n: text.length };
      trim(index);
      for (let attempt = 0; attempt < 3; attempt++) {
        try { ls.setItem(PREFIX + key, text); writeIndex(index); return true; }
        catch (e) { if (!isQuota(e) || !trim(index, text.length)) break; }
      }
      delete index[key]; writeIndex(index);
      return false;
    },
  };

  // Settings, drawings and the like: on a full quota, make room by trimming cached copies, then try again.
  const Store = {
    set(key, value) {
      if (!ls) return false;
      try { ls.setItem(key, value); return true; }
      catch (e) {
        if (!isQuota(e)) return false;
        const index = readIndex();
        adopt(index);
        trim(index, value.length + 50000);
        writeIndex(index);
        try { ls.setItem(key, value); return true; } catch { return false; }
      }
    },
  };

  // One-time move of the open-interest samples that used to be stored outside the cache.
  if (ls) try {
    const legacy = []; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith('hl-oi:')) legacy.push(k); }
    for (const key of legacy) { const v = ls.getItem(key); ls.removeItem(key); if (!ls.getItem(PREFIX + key)) ls.setItem(PREFIX + key, v); }
  } catch {}
  if (ls) { const index = readIndex(); const before = Object.keys(index).length; adopt(index); trim(index); if (Object.keys(index).length !== before || before) writeIndex(index); }
  const api = { Stash, Store, STASH_BUDGET };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else Object.assign(root, api);
})(typeof globalThis === 'undefined' ? this : globalThis);
