(function(root){
  'use strict';
  const rules=typeof module!=='undefined'&&module.exports?require('./cycle-rules.js'):null;
  const assets=[{symbol:'NQ1!',feed:'NQ=F'},{symbol:'ES1!',feed:'ES=F'},{symbol:'YM1!',feed:'YM=F'}];
  // Instruments outside the built-in list (terminal charts): symbol -> Yahoo feed.
  const extraFeeds=new Map();
  function register(symbol,feed){if(!assets.some(a=>a.symbol===symbol))extraFeeds.set(symbol,{symbol,feed});}
  const descriptorFor=symbol=>assets.find(asset=>asset.symbol===symbol)||extraFeeds.get(symbol);
  const panels=[
    {id:'day-highs',scope:'day',side:'high',title:'Aktualne High Dnia',keys:['weekly','daily','m90','micro']},
    {id:'day-lows',scope:'day',side:'low',title:'Aktualne Low Dnia',keys:['weekly','daily','m90','micro']},
    {id:'month-highs',scope:'month',side:'high',title:'Aktualne High Miesiąca',keys:['monthly','weekly','daily']},
    {id:'month-lows',scope:'month',side:'low',title:'Aktualne Low Miesiąca',keys:['monthly','weekly','daily']},
    {id:'week-lows',scope:'week',side:'low',title:'Aktualne Low Tygodnia',keys:['monthly','weekly','daily'],session:true},
    {id:'week-highs',scope:'week',side:'high',title:'Aktualne High Tygodnia',keys:['monthly','weekly','daily'],session:true}
  ];
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  function parts(ms){return Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
  function tradingDay(ms){
    const p=parts(ms),date=new Date(Date.UTC(p.year,p.month-1,p.day+(p.hour>=18?1:0)));
    return {key:date.toISOString().slice(0,10),weekday:date.getUTCDay()};
  }
  function quarters(ms){
    const p=parts(ms),seconds=((p.hour*3600+p.minute*60+p.second)-64800+86400)%86400;
    const weekday=tradingDay(ms).weekday;
    return {weekly:weekday===5?'Q1/Q4':weekday>=1&&weekday<=4?'Q'+weekday:'Q0',daily:'Q'+(Math.floor(seconds/21600)+1),m90:'Q'+(Math.floor(seconds/5400)%4+1),micro:'Q'+(Math.floor(seconds/1350)%4+1)};
  }
  function monthly(ms){
    const [year,month,day]=tradingDay(ms).key.split('-').map(Number);
    return 'Q'+(rules||root.CycleRules).fullWeekQuarter(year,month,day);
  }
  // Calendar quarter (Jan-Mar = Q1 ...) of the trading day: the QUARTERLY row of the timeline.
  function calendarQuarter(ms){return 'Q'+(Math.floor((Number(tradingDay(ms).key.slice(5,7))-1)/3)+1);}
  function quarterRange(start,end){
    const first=quarters(start),last=quarters(end-1);
    return Object.fromEntries(Object.keys(first).map(key=>[key,first[key]===last[key]?first[key]:first[key]+' / '+last[key]]));
  }
  function periodKey(day,scope){
    if(scope==='month')return day.slice(0,7);
    if(scope==='day')return day;
    const date=new Date(day+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
    return date.toISOString().slice(0,10);
  }
  function parseBars(chart,symbol,now){
    const descriptor=descriptorFor(symbol);
    if(!descriptor||chart?.meta?.symbol!==descriptor.feed)throw new Error('Unexpected instrument');
    const times=chart.timestamp,quote=chart.indicators?.quote?.[0];
    if(!Array.isArray(times)||!Array.isArray(quote?.high))throw new Error('Missing candles');
    // Indices (e.g. DX-Y.NYB) report zero volume for every candle; only drop empty candles when volume exists.
    const hasVolume=Array.isArray(quote.volume)&&quote.volume.some(v=>v>0);
    const bars=[];
    for(let i=0;i<times.length;i++){
      const time=times[i]*1000,high=quote.high[i],low=quote.low?.[i],volume=quote.volume?.[i];
      if(!Number.isFinite(time)||time>now||(hasVolume&&volume===0))continue;
      if(!(Number.isFinite(high)&&high>0)&&!(Number.isFinite(low)&&low>0))continue;
      const day=tradingDay(time);
      if(day.weekday===0||day.weekday===6)continue;
      bars.push({time,high,low,day:day.key});
    }
    bars.sort((a,b)=>a.time-b.time);
    if(!bars.length)throw new Error('No trading data');
    return bars;
  }
  function extreme(bars,scope,side,intervalSeconds,now){
    const latest=bars[bars.length-1],period=periodKey(latest.day,scope);
    const selected=bars.filter(bar=>periodKey(bar.day,scope)===period&&Number.isFinite(bar[side])&&bar[side]>0);
    if(!selected.length)return {error:'Brak danych'};
    // Do not claim a complete week/month when the returned history starts mid-period.
    if(scope!=='day'){
      const start=scope==='month'?period+'-01':period;
      const firstWeekday=new Date(start+'T12:00:00Z');
      while([0,6].includes(firstWeekday.getUTCDay()))firstWeekday.setUTCDate(firstWeekday.getUTCDate()+1);
      if(bars[0].day>firstWeekday.toISOString().slice(0,10))return {error:'Niepełna historia okresu'};
    }
    let best=selected[0],touches=0;
    for(const bar of selected){
      if(side==='high'?bar[side]>best[side]:bar[side]<best[side]){best=bar;touches=1;}
      else if(bar[side]===best[side])touches++;
    }
    const end=Math.min(best.time+intervalSeconds*1000,now+1),q=quarterRange(best.time,end);
    const firstMonthly=monthly(best.time),lastMonthly=monthly(end-1);
    return {day:latest.day,period,price:best[side],from:best.time,to:end,quarters:{quarterly:calendarQuarter(best.time),monthly:firstMonthly===lastMonthly?firstMonthly:firstMonthly+' / '+lastMonthly,...q},touches,firstBarAt:selected[0].time,lastBarAt:latest.time,barCount:selected.length,intervalSeconds};
  }
  function summarize(chart,symbol,now=Date.now()){
    const result=extreme(parseBars(chart,symbol,now),'day','high',60,now);
    const {monthly:unused,...q}=result.quarters;
    return {symbol,feed:descriptorFor(symbol).feed,contract:String(chart.meta.shortName||symbol),...result,quarters:q};
  }
  function summarizeAll(intraday,history,symbol,now=Date.now()){
    const result={symbol,feed:descriptorFor(symbol)?.feed,contract:String(intraday?.meta?.shortName||history?.meta?.shortName||symbol),periods:{}};
    for(const [chart,scopes,interval] of [[intraday,['day'],60],[history,['week','month'],300]]){
      try{
        const bars=parseBars(chart,symbol,now);
        for(const scope of scopes)result.periods[scope]={high:extreme(bars,scope,'high',interval,now),low:extreme(bars,scope,'low',interval,now)};
      }catch{for(const scope of scopes)result.periods[scope]={high:{error:'Brak danych'},low:{error:'Brak danych'}};}
    }
    return result;
  }
  function matchingKeys(q,keys){
    const matched=new Set();
    for(let n=1;n<=4;n++){
      const value='Q'+n;
      // Friday's deliberate Q1/Q4 label follows the timeline rule. A candle
      // straddling a boundary ("Q1 / Q2") is uncertain and cannot confirm a match.
      const same=keys.filter(key=>q[key]===value||(key==='weekly'&&q[key]==='Q1/Q4'&&(n===1||n===4)));
      if(same.length>=3)same.forEach(key=>matched.add(key));
    }
    return [...matched];
  }
  // The session of an extreme, written as its quarter of the Daily Cycle profile
  // (Asia Q1, London Q2, NY AM Q3, NY PM Q4). A candle across a boundary keeps both.
  function sessionLabel(dailyQ){
    return String(dailyQ).split(' / ').map(q=>/^Q[1-4]$/.test(q)?q:'—').join(' / ');
  }
  const api={register,calendarQuarter,assets,panels,tradingDay,quarters,quarterRange,monthly,periodKey,summarize,summarizeAll,matchingKeys,sessionLabel};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DayHighs=api;
})(typeof globalThis==='undefined'?this:globalThis);
