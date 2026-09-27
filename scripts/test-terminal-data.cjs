const assert=require('node:assert/strict');
const Terminal=require('../public/terminal-data.js');
const Highs=require('../public/day-highs.js');
const at=Date.parse;

// Symbols: TradingView-style continuous futures and pass-through Yahoo tickers; anything odd is refused.
assert.equal(Terminal.feedFor('NQ1!'),'NQ=F');
assert.equal(Terminal.feedFor('BTC1!'),'BTC=F');
assert.equal(Terminal.feedFor('ETH1!'),'ETH=F');
assert.equal(Terminal.feedFor('DXY1!'),'DX-Y.NYB');
assert.equal(Terminal.feedFor('AAPL'),'AAPL');
assert.equal(Terminal.feedFor('BTC-USD'),'BTC-USD');
for(const bad of ['','a b','nq1!','../etc','A'.repeat(20),null,undefined,'X&y=1'])assert.equal(Terminal.feedFor(bad),null,String(bad));
assert.equal(Terminal.TAPE.length,50);
assert.equal(new Set(Terminal.TAPE.map(t=>t[0])).size,50);

// 6H candles are built from hourly ones.
const hourly=[0,1,2,3,4,5,6,7].map(h=>({time:h*3600,open:h,high:h+10,low:h-10,close:h+1}));
assert.deepEqual(Terminal.aggregate(hourly,21600),[{time:0,open:0,high:15,low:-10,close:6},{time:21600,open:6,high:17,low:-4,close:8}]);

// FinancialJuice RSS: entities, prefix removal and link allow-list.
const rss=`<rss><channel><item><title>FinancialJuice: Fed&apos;s Powell &amp; co: rates</title><link>https://www.financialjuice.com/News/1/x.aspx</link><guid>1</guid><pubDate>Sat, 26 Sep 2026 21:16:34 GMT</pubDate></item>
<item><title>Evil</title><link>https://evil.example/x</link><guid>2</guid><pubDate>Sat, 26 Sep 2026 21:16:34 GMT</pubDate></item></channel></rss>`;
const items=Terminal.parseRss(rss);
assert.equal(items.length,1);
assert.equal(items[0].title,"Fed's Powell & co: rates");

// Quarterly cycle of an extreme is the calendar quarter of its trading day.
assert.equal(Highs.calendarQuarter(at('2026-02-10T15:00:00Z')),'Q1');
assert.equal(Highs.calendarQuarter(at('2026-09-24T15:00:00Z')),'Q3');
assert.equal(Highs.calendarQuarter(at('2026-12-31T23:00:00Z')),'Q1'); // 18:00 ET rolls into January 1st

// Indices report zero volume for every bar; those bars must still count (DXY).
function chart(feed,volume){return {meta:{symbol:feed,shortName:'Index'},timestamp:[at('2026-09-22T12:00:00Z')/1000,at('2026-09-22T12:01:00Z')/1000],indicators:{quote:[{high:[100,110],low:[90,95],volume:[volume,volume]}]}};}
Highs.register('DXY1!','DX-Y.NYB');
assert.equal(Highs.summarizeAll(chart('DX-Y.NYB',0),null,'DXY1!',at('2026-09-22T13:00:00Z')).periods.day.high.price,110);

// End to end with a fake transport: chart, cycles, tape and translated headlines.
(async()=>{
  const calls=[];
  const chartJson=(feed)=>JSON.stringify({chart:{result:[{meta:{symbol:feed,shortName:'Test',regularMarketPrice:105,chartPreviousClose:1,currency:'USD'},
    timestamp:[at('2026-09-21T12:00:00Z')/1000,at('2026-09-22T12:00:00Z')/1000,at('2026-09-22T12:01:00Z')/1000],
    indicators:{quote:[{open:[1,2,3],high:[100,110,120],low:[90,95,99],close:[95,100,105],volume:[1,1,1]}]}}]}});
  const transport=async url=>{
    calls.push(url);
    if(url.includes('/v8/finance/spark'))return {status:200,text:JSON.stringify({'NQ=F':{fulldayPrice:100.5,fulldayChangePercent:1.5}})};
    if(url.includes('financialjuice'))return {status:200,text:rss.replace('Evil','Other')};
    if(url.includes('translate.googleapis.com'))return {status:200,text:JSON.stringify([[['Przetłumaczone','x']]])};
    return {status:200,text:chartJson(decodeURIComponent(url.match(/chart\/([^?]+)/)[1]))};
  };
  const data=Terminal.create(transport);
  const c=await data.chart('BTC1!','1D');
  assert.equal(c.feed,'BTC=F');
  assert.equal(c.candles.length,3);
  assert.equal(c.previousClose,100); // second-to-last daily close, not the start of the range
  await assert.rejects(data.chart('nq1!','1D'),/bad symbol/);
  await assert.rejects(data.chart('NQ1!','5m'),/bad symbol/);
  const h=await data.highs('NQ1!');
  assert.equal(h.symbol,'NQ1!');
  for(const key of ['hotm','lotm','hotw','lotw','hotd','lotd'])assert.ok(h[key]===null||h[key].length===3,key);
  assert.deepEqual((await data.tape())[0],{symbol:'NQ1!',price:100.5,change:1.5});
  const news=await data.news();
  assert.equal(news.items[0].pl,'Przetłumaczone');
  assert.equal(news.items[0].title,"Fed's Powell & co: rates");
  // A failing feed keeps serving the previous headlines instead of throwing.
  const failing=Terminal.create(async url=>url.includes('financialjuice')?{status:429,text:''}:transport(url));
  await assert.rejects(failing.news(),/429/);
  console.log('PASS terminal data: symbols, 6H candles, RSS parsing, quarterly cycle, index volume, chart/highs/tape/news with translation');
})().catch(error=>{console.error(error);process.exit(1);});
