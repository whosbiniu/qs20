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

// Calendar ranges: bounds are computed in New York time, weeks start on Monday.
assert.deepEqual(Terminal.rangeBounds('next-week',at('2026-09-27T12:00:00Z')),{from:'2026-09-28',to:'2026-10-04'});
assert.deepEqual(Terminal.rangeBounds('next-week',at('2026-09-28T03:00:00Z')),{from:'2026-09-28',to:'2026-10-04'}); // still Sunday evening in New York
assert.deepEqual(Terminal.rangeBounds('month',at('2026-12-15T12:00:00Z')),{from:'2027-01-01',to:'2027-01-31'});
assert.deepEqual(Terminal.rangeBounds('quarter',at('2026-09-27T12:00:00Z')),{from:'2026-10-01',to:'2026-12-31'});
assert.deepEqual(Terminal.rangeBounds('quarter',at('2026-11-15T12:00:00Z')),{from:'2027-01-01',to:'2027-03-31'});
assert.deepEqual(Terminal.rangeBounds('today',at('2026-09-27T12:00:00Z')),{from:'2026-09-27',to:'2026-09-27'});
assert.deepEqual(Terminal.rangeBounds('week',at('2026-09-27T12:00:00Z')),{from:'2026-09-21',to:'2026-09-27'}); // Sunday belongs to the week that started on Monday
assert.deepEqual(Terminal.rangeBounds('week',at('2026-09-28T16:00:00Z')),{from:'2026-09-28',to:'2026-10-04'});
assert.equal(Terminal.rangeBounds('year'),null);
assert.equal(Terminal.tvValue(54.8),'54.8');
assert.equal(Terminal.tvValue(4.1,'%'),'4.1%');
assert.equal(Terminal.tvValue(100,undefined,'K'),'100K');
assert.equal(Terminal.tvValue(null,'%'),'');
assert.deepEqual(Terminal.fromTradingView([{title:'NFP',date:'2026-10-02T12:30:00.000Z',importance:1,forecast:100,previous:162,scale:'K'},{title:'x',date:'bad',importance:0}]),
  [{title:'NFP',date:'2026-10-02T12:30:00.000Z',impact:'High',forecast:'100K',previous:'162K'}]);

// Monitor parsers: bad coordinates and foreign links are dropped, polygons get a centroid, ground aircraft have altitude 0.
const quakes=Terminal.parseQuakes({features:[
  {id:'a',geometry:{coordinates:[10,20,5]},properties:{mag:4.2,place:'X',time:2000,url:'https://earthquake.usgs.gov/e/a'}},
  {id:'b',geometry:{coordinates:[10,20,5]},properties:{mag:3,place:'Y',time:3000,url:'https://evil.example/b'}},
  {id:'c',geometry:{coordinates:[null,20,5]},properties:{mag:3,place:'Z',time:4000,url:'https://earthquake.usgs.gov/e/c'}},
  {id:'d',geometry:{coordinates:[1,2,3]},properties:{mag:5,place:'W',time:5000,url:'https://earthquake.usgs.gov/e/d'}}]});
assert.deepEqual(quakes.map(q=>q.id),['d','a']); // newest first
const events=Terminal.parseEvents({events:[
  {id:'e1',title:'Storm',categories:[{title:'Severe Storms'}],link:'http://insecure.example/x',sources:[{url:'https://example.org/s'}],geometry:[{type:'Point',date:'2026-09-26T00:00:00Z',coordinates:[1,2]},{type:'Point',date:'2026-09-27T00:00:00Z',coordinates:[3,4]}]},
  {id:'e2',title:'Fire',categories:[{title:'Wildfires'}],link:'https://eonet.example/f',geometry:[{type:'Polygon',date:'2026-09-27T00:00:00Z',coordinates:[[[0,0],[2,0],[2,2],[0,2]]]}]},
  {id:'e3',title:'None',geometry:[]}]});
assert.deepEqual(events.map(e=>[e.id,e.lon,e.lat]),[['e1',3,4],['e2',1,1]]);
assert.equal(events[0].url,'https://example.org/s');
const planes=Terminal.parseAircraft({ac:[{hex:'abc',flight:'RCH123 ',t:'C17',lat:10,lon:20,alt_baro:'ground',gs:5,track:90},{hex:'no',lat:null,lon:1}]});
assert.deepEqual(planes,[{id:'abc',callsign:'RCH123',type:'C17',reg:'',lat:10,lon:20,alt:0,speed:5,track:90}]);
const articles=Terminal.parseArticles({articles:[{title:'Hit',url:'https://x.example/1',domain:'x.example',sourcecountry:'US',seendate:'20260927T101500Z'},{title:'Bad',url:'javascript:alert(1)',seendate:'20260927T101500Z'}]});
assert.equal(articles.length,1);
assert.equal(new Date(articles[0].time).toISOString(),'2026-09-27T10:15:00.000Z');

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
  await assert.rejects(data.chart('NQ1!','2m'),/bad symbol/);
  const h=await data.highs('NQ1!');
  assert.equal(h.symbol,'NQ1!');
  for(const key of ['hotm','lotm','hotw','lotw','hotd','lotd'])assert.ok(h[key]===null||h[key].length===3,key);
  assert.deepEqual((await data.tape())[0],{symbol:'NQ1!',chart:'NQ1!',price:100.5,change:1.5});
  const news=await data.news();
  assert.equal(news.items[0].pl,'Przetłumaczone');
  assert.equal(news.items[0].title,"Fed's Powell & co: rates");
  // Calendar: next week falls back to TradingView when Forex Factory has no file; beyond its horizon the answer is empty.
  // Wednesday and Thursday of next week (New York calendar), whatever day the test runs.
  const [yy,mm,dd]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(Date.now()).split('-').map(Number);
  const nextMonday=new Date(Date.UTC(yy,mm-1,dd));nextMonday.setUTCDate(dd-(nextMonday.getUTCDay()+6)%7+7);
  const day=n=>{const x=new Date(nextMonday);x.setUTCDate(nextMonday.getUTCDate()+n);return x.toISOString().slice(0,10)};
  const tv={status:'ok',result:[{title:'ISM',date:day(2)+'T14:00:00.000Z',importance:1,forecast:54.8,previous:54.6},{title:'Late',date:day(3)+'T14:00:00.000Z',importance:-1}]};
  const cal=Terminal.create(async url=>url.includes('nextweek')?{status:404,text:''}:url.includes('tradingview')?{status:200,text:JSON.stringify(tv)}:transport(url));
  const week=await cal.calendar('next-week');
  assert.equal(week.source,'TradingView');
  assert.equal(week.events.length,2);
  assert.equal(week.availableTo,day(3));
  assert.equal(week.partial,false);
  const empty=Terminal.create(async url=>url.includes('tradingview')?{status:200,text:JSON.stringify({status:'ok'})}:{status:404,text:''});
  const none=await empty.calendar('quarter');
  assert.deepEqual([none.events.length,none.availableTo,none.partial],[0,null,true]);
  await assert.rejects(empty.calendar('year'),/bad range/);
  const ff=Terminal.create(async url=>url.includes('nextweek')?{status:200,text:JSON.stringify([{title:'CPI',country:'USD',date:day(2)+'T08:30:00-04:00',impact:'High',forecast:'0.3%',previous:'0.2%'},{title:'Other',country:'EUR',date:day(2)+'T08:30:00-04:00',impact:'High'}])}:{status:500,text:''});
  const ffWeek=await ff.calendar('next-week');
  assert.deepEqual([ffWeek.source,ffWeek.events.length,ffWeek.events[0].title],['Forex Factory',1,'CPI']);
  // Monitor: one failing source does not break the others; all failing is an error.
  const mon=Terminal.create(async url=>{
    if(url.includes('usgs'))return {status:200,text:JSON.stringify({features:[{id:'q',geometry:{coordinates:[1,2,3]},properties:{mag:4,place:'P',time:Date.now()-60000,url:'https://earthquake.usgs.gov/q'}}]})};
    if(url.includes('adsb.lol'))return {status:200,text:JSON.stringify({ac:[{hex:'a',lat:1,lon:2}]})};
    return {status:500,text:''};
  });
  const world=await mon.monitor();
  assert.deepEqual([world.quakes.length,world.aircraft.length,world.events.length,world.articles.length],[1,1,0,0]);
  assert.ok(['events','articles'].every(name=>world.failed.includes(name))&&!['quakes','aircraft'].some(name=>world.failed.includes(name)),String(world.failed));
  await assert.rejects(Terminal.create(async()=>({status:500,text:''})).monitor(),/no monitor data/);
  // Earnings: Yahoo's screener needs cookie + crumb; preferred shares are dropped; an expired crumb is refreshed once.
  const [ey,em]=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(Date.now()).split('-').map(Number);
  const nextMonth=k=>new Date(Date.UTC(ey,em-1+k,1)).toISOString().slice(0,10);
  const seen=[];
  let crumbs=0;
  const yahooEarnings=Terminal.create(async(url,options)=>{
    seen.push([url.split('?')[0],options?.method||'GET']);
    if(url.startsWith('https://fc.yahoo.com'))return {status:404,text:''};
    if(url.includes('getcrumb'))return {status:200,text:'crumb'+(++crumbs)};
    if(url.includes('visualization')){
      if(url.includes('crumb1'))return {status:401,text:'{"finance":{"error":{"code":"Unauthorized"}}}'};
      const body=JSON.parse(options.body);
      assert.equal(body.entityIdType,'earnings');
      assert.deepEqual(body.query.operands.map(o=>o.operands[1]),[nextMonth(1),nextMonth(2),'us']); // "month" = the next calendar month (ET)
      return {status:200,text:JSON.stringify({finance:{result:[{documents:[{columns:['ticker','companyshortname','startdatetime','startdatetimetype','epsestimate','epsactual','epssurprisepct','intradaymarketcap'].map(id=>({id})),
        rows:[['JPM-PC','JPMorgan pref','2026-10-13T12:30:00.000Z','TAS',null,null,null,3e10],['JPM','JPMorgan','2026-10-13T12:30:00.000Z','BMO',4.1,4.3,4.9,9e11],['BAD!','x','2026-10-13T12:30:00.000Z','BMO',null,null,null,1]]}]}]}})};
    }
    return {status:404,text:''};
  });
  const earn=await yahooEarnings.earnings('month');
  assert.deepEqual(earn.items.map(e=>e.symbol),['JPM']);
  assert.deepEqual([earn.items[0].epsEstimate,earn.items[0].epsActual,earn.items[0].timing],[4.1,4.3,'BMO']);
  assert.equal(crumbs,2); // the first crumb was rejected, a fresh one worked
  assert.ok(seen.some(([url,method])=>url.includes('visualization')&&method==='POST'));
  await assert.rejects(yahooEarnings.earnings('year'),/bad range/);
  // A failing feed keeps serving the previous headlines instead of throwing.
  const failing=Terminal.create(async url=>url.includes('financialjuice')?{status:429,text:''}:transport(url));
  await assert.rejects(failing.news(),/429/);
  console.log('PASS terminal data: symbols, 6H candles, RSS parsing, quarterly cycle, index volume, chart/highs/tape/news with translation, calendar ranges, earnings, monitor layers');
})().catch(error=>{console.error(error);process.exit(1);});
