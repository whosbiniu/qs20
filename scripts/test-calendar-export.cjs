const assert=require('node:assert/strict');
const {toUTC,event}=require('../public/calendar-export.js');
const wall=value=>Date.parse(value+'Z');
for(const [local,utc] of [
  ['2026-01-16T03:56:15','2026-01-16T08:56:15.000Z'],
  ['2026-09-25T03:56:15','2026-09-25T07:56:15.000Z'],
  ['2026-03-06T18:00:00','2026-03-06T23:00:00.000Z'],
  ['2026-03-09T18:00:00','2026-03-09T22:00:00.000Z'],
  ['2026-10-30T18:00:00','2026-10-30T22:00:00.000Z'],
  ['2026-11-02T18:00:00','2026-11-02T23:00:00.000Z'],
])assert.equal(new Date(toUTC(wall(local))).toISOString(),utc);
const start=wall('2026-09-24T23:54:22.500');
const input={name:'Azja',q:4,start,end:start+337500};
const result=event(input,Date.UTC(2026,8,25));
const unfolded=result.ics.replace(/\r\n /g,'');
assert.ok(unfolded.includes('DTSTART:20260925T035422Z\r\n'));
assert.ok(unfolded.includes('DTEND:20260925T040000Z\r\n'));
assert.ok(unfolded.includes('DTSTAMP:20260925T000000Z\r\n'));
assert.ok(unfolded.includes('SUMMARY:High Probability · Azja · Q4 ×3'));
assert.ok(unfolded.includes('2026-09-24 23:54:22\\,5 – 2026-09-25 00:00:00 ET'));
assert.ok(result.ics.endsWith('END:VCALENDAR\r\n'));
assert.ok(result.ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));
assert.equal(result.filename,event(input,Date.now()).filename);
const london=event({name:'Londyn',q:3,start:wall('2026-09-25T03:56:15'),end:wall('2026-09-25T04:01:52.500')}).ics;
assert.ok(london.includes('DTEND:20260925T080153Z'));
assert.throws(()=>event({...input,name:'Unexpected\nATTENDEE:bad'}));
assert.throws(()=>event({...input,end:start}));
const dayStart=wall('2026-09-24T18:00:00');
const dayInput={scope:'day',name:'Dzień',q:1,start:dayStart,end:dayStart+1350000};
const dayEvent=event(dayInput),dayICS=dayEvent.ics.replace(/\r\n /g,'');
assert.ok(dayICS.includes('DTSTART:20260924T220000Z\r\n'));
assert.ok(dayICS.includes('DTEND:20260924T222230Z\r\n'));
assert.ok(dayICS.includes('DESCRIPTION:DAILY Q1 / 90MIN Q1 / MICRO Q1'));
assert.ok(dayICS.includes('SUMMARY:High Probability · Dzień · Q1 ×3'));
assert.ok(!dayICS.includes('NANO'));
assert.notEqual(dayEvent.filename,event({name:'Azja',q:1,start:dayStart,end:dayStart+337500}).filename);
assert.equal(dayEvent.filename,event(dayInput).filename);
assert.throws(()=>event({...dayInput,scope:'session'}));
assert.throws(()=>event({...dayInput,end:dayStart+337500}));
console.log('PASS calendar export: ET winter/summer, DST changes, midnight, rounding, stable IDs, UTF-8 folding, validation');
console.log('PASS daily export: 22.5-minute window, DAILY/90MIN/MICRO, separate session/day IDs');
