(function (root) {
  function targetQuarters(sourceQ, { edgePair = false, sourceLabel = '' } = {}) {
    if (sourceQ === 2 || sourceQ === 3) return [1, 3];
    if (edgePair && (sourceQ === 1 || sourceQ === 4 || sourceLabel === 'Q1/Q4')) return [1, 4];
    return sourceQ >= 1 && sourceQ <= 4 ? [sourceQ] : [];
  }

  // Calendar dates of the trading week, independent of holidays and DST.
  // Friday must remain in Monday's month; a crossing week is Q0 in full.
  function fullWeekQuarter(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 4);
    if (monday.getUTCMonth() !== date.getUTCMonth() || friday.getUTCMonth() !== date.getUTCMonth()) return 0;
    const first = new Date(Date.UTC(year, month - 1, 1));
    const firstMonday = 1 + (8 - first.getUTCDay()) % 7;
    return Math.min(4, Math.floor((monday.getUTCDate() - firstMonday) / 7) + 1);
  }

  const api = { targetQuarters, fullWeekQuarter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CycleRules = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
