const assert = require('node:assert/strict');
const { targetQuarters, fullWeekQuarter } = require('../public/cycle-rules.js');

// London / NY AM and Tuesday / Wednesday now share the two windows.
for (const source of [2, 3]) {
  assert.deepEqual(targetQuarters(source), [1, 3]);
  assert.deepEqual(targetQuarters(source, { edgePair: true }), [1, 3]);
}
assert.deepEqual(targetQuarters(1), [1]);
assert.deepEqual(targetQuarters(4), [4]);
assert.deepEqual(targetQuarters(1, { edgePair: true }), [1, 4]);
assert.deepEqual(targetQuarters(4, { edgePair: true }), [1, 4]);
assert.deepEqual(targetQuarters(0), []);
assert.deepEqual(targetQuarters(0, { edgePair: true, sourceLabel: 'Q1/Q4' }), [1, 4]);

// The user's example: the ENTIRE Aug 29–Sep 2 trading week is Q0.
for (const [month, day] of [[8, 29], [8, 30], [8, 31], [9, 1], [9, 2]]) {
  assert.equal(fullWeekQuarter(2022, month, day), 0);
}
assert.equal(fullWeekQuarter(2022, 9, 5), 1);
assert.equal(fullWeekQuarter(2022, 9, 12), 2);
assert.equal(fullWeekQuarter(2022, 9, 19), 3);
assert.equal(fullWeekQuarter(2022, 9, 30), 4);
// A weekend crossing into another month does not invalidate Mon–Fri.
assert.equal(fullWeekQuarter(2025, 1, 31), 4);
assert.equal(fullWeekQuarter(2025, 2, 1), 0);
assert.equal(fullWeekQuarter(2025, 2, 3), 1);
assert.equal(fullWeekQuarter(2024, 2, 29), 0);
assert.equal(fullWeekQuarter(2024, 6, 19), 3); // Holidays do not change numbering.
console.log('PASS Q2/Q3 windows, existing Q1/Q4 and Friday rules, full-week boundaries');
