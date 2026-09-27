const assert=require('node:assert/strict');
const Highs=require('../public/day-highs.js');
const at=Date.parse;

assert.deepEqual(Highs.quarters(at('2026-09-20T22:00:00Z')),{weekly:'Q1',daily:'Q1',m90:'Q1',micro:'Q1'});
assert.equal(Highs.tradingDay(at('2026-09-21T21:59:59Z')).key,'2026-09-21');
assert.equal(Highs.tradingDay(at('2026-09-21T22:00:00Z')).key,'2026-09-22');
assert.equal(Highs.quarters(at('2026-09-21T22:00:00Z')).weekly,'Q2');
assert.equal(Highs.quarters(at('2026-09-25T14:00:00Z')).weekly,'Q1/Q4');
assert.equal(Highs.quarters(at('2026-01-04T23:00:00Z')).daily,'Q1');
assert.equal(Highs.tradingDay(at('2026-01-04T23:00:00Z')).key,'2026-01-05');
assert.equal(Highs.quarters(at('2026-03-08T22:00:00Z')).daily,'Q1');
assert.equal(Highs.quarters(at('2026-11-01T23:00:00Z')).daily,'Q1');
assert.deepEqual(Highs.quarterRange(at('2026-09-21T04:22:00Z'),at('2026-09-21T04:23:00Z')),{weekly:'Q1',daily:'Q2',m90:'Q1',micro:'Q1 / Q2'});
assert.equal(Highs.quarterRange(at('2026-09-21T04:21:00Z'),at('2026-09-21T04:22:00Z')).micro,'Q1');
assert.equal(Highs.quarters(at('2026-09-21T05:30:00Z')).m90,'Q2');

function chart(rows){return {meta:{symbol:'NQ=F',shortName:'Nasdaq futures'},timestamp:rows.map(row=>at(row[0])/1000),indicators:{quote:[{high:rows.map(row=>row[1]),volume:rows.map(row=>row[2]??1)}]}};}
const data=chart([
 ['2026-09-20T22:00:00Z',999], // Previous trading day must not supply today's high.
 ['2026-09-21T22:00:00Z',100],
 ['2026-09-22T04:22:00Z',120],
 ['2026-09-22T05:10:00Z',120], // Repeated high: retain the first candle's time.
 ['2026-09-22T05:11:00Z',null],
 ['2026-09-22T05:12:00Z',9999,0], // No trading volume.
 ['2026-09-22T12:00:00Z',9999], // Future data is not observable.
]);
const result=Highs.summarize(data,'NQ1!',at('2026-09-22T06:00:00Z'));
assert.equal(result.price,120);
assert.equal(result.day,'2026-09-22');
assert.equal(result.from,at('2026-09-22T04:22:00Z'));
assert.equal(result.touches,2);
assert.equal(result.quarters.micro,'Q1 / Q2');
assert.equal(result.quarters.weekly,'Q2');
assert.equal(result.lastBarAt,at('2026-09-22T05:10:00Z'));
assert.throws(()=>Highs.summarize(data,'YM1!'));
assert.throws(()=>Highs.summarize(chart([]),'NQ1!'));
const friday=chart([['2026-09-25T14:00:00Z',150],['2026-09-26T14:00:00Z',999]]);
assert.equal(Highs.summarize(friday,'NQ1!',at('2026-09-27T12:00:00Z')).day,'2026-09-25');
console.log('PASS day highs: ET trading-day rollover, DST, first high/retests, correct symbol, null/zero-volume/future bars, weekend data and ambiguous Micro boundaries');

const history=chart([
 ['2026-08-31T22:00:00Z',100],
 ['2026-09-08T10:00:00Z',180],
 ['2026-09-21T22:00:00Z',130],
 ['2026-09-23T10:00:00Z',160],
 ['2026-09-25T14:00:00Z',140]
]);
history.indicators.quote[0].low=[90,40,80,60,100];
const daily=chart([['2026-09-24T22:00:00Z',120],['2026-09-25T04:22:00Z',150]]);
daily.indicators.quote[0].low=[110,95];
const all=Highs.summarizeAll(daily,history,'NQ1!',at('2026-09-25T15:00:00Z'));
assert.equal(all.periods.day.low.price,95);
assert.equal(all.periods.week.high.price,160);
assert.equal(all.periods.week.low.price,60);
assert.equal(all.periods.month.high.price,180);
assert.equal(all.periods.month.low.price,40);
assert.equal(all.periods.month.high.quarters.monthly,'Q1');
assert.equal(all.periods.week.high.quarters.monthly,'Q3');
assert.equal(Highs.monthly(at('2026-08-31T22:00:00Z')),'Q0');
assert.equal(Highs.periodKey('2026-01-01','week'),'2025-12-29');
assert.equal(Highs.periodKey('2026-01-01','month'),'2026-01');
assert.deepEqual(Highs.matchingKeys(all.periods.week.high.quarters,['monthly','weekly','daily']),['monthly','weekly','daily']);
assert.deepEqual(Highs.matchingKeys({weekly:'Q1',daily:'Q1',m90:'Q2',micro:'Q1'},['weekly','daily','m90','micro']),['weekly','daily','micro']);
assert.deepEqual(Highs.matchingKeys({weekly:'Q1',daily:'Q1',micro:'Q1 / Q2'},['weekly','daily','micro']),[]);
assert.deepEqual(Highs.matchingKeys({monthly:'Q0',weekly:'Q0',daily:'Q0'},['monthly','weekly','daily']),[]);
assert.deepEqual(Highs.matchingKeys({weekly:'Q1/Q4',daily:'Q4',m90:'Q4',micro:'Q2'},['weekly','daily','m90','micro']),['weekly','daily','m90']);
const missingHistory=Highs.summarizeAll(daily,null,'NQ1!',at('2026-09-25T15:00:00Z'));
assert.equal(missingHistory.periods.day.high.price,150);
assert(missingHistory.periods.month.high.error);
const shortHistory=Highs.summarizeAll(daily,daily,'NQ1!',at('2026-09-25T15:00:00Z'));
assert.equal(shortHistory.periods.month.high.error,'Niepełna historia okresu');
assert.equal(shortHistory.periods.week.low.error,'Niepełna historia okresu');
console.log('PASS six extrema: independent high/low periods, complete history, month/week boundaries, monthly Q0, three-quarter highlighting and uncertainty exclusions');

assert.equal(Highs.sessionLabel('Q1'),'Azja');
assert.equal(Highs.sessionLabel('Q2'),'Londyn');
assert.equal(Highs.sessionLabel('Q3'),'NY AM');
assert.equal(Highs.sessionLabel('Q4'),'NY PM');
assert.equal(Highs.sessionLabel('Q2 / Q3'),'Londyn / NY AM');
assert.equal(Highs.panels.filter(panel=>panel.session).length,2);
console.log('PASS weekly session names, including ambiguous boundaries');
