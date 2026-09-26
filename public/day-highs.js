(function(root){
  'use strict';
  const assets = [{symbol:'NQ1!',feed:'NQ=F'},{symbol:'ES1!',feed:'ES=F'},{symbol:'YM1!',feed:'YM=F'}];
  const formatter = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
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
  function quarterRange(start,end){
    const first=quarters(start),last=quarters(end-1);
    return Object.fromEntries(Object.keys(first).map(key=>[key,first[key]===last[key]?first[key]:first[key]+' / '+last[key]]));
  }
  function summarize(chart,symbol,now=Date.now()){
    const descriptor=assets.find(asset=>asset.symbol===symbol);
    if(!descriptor||chart?.meta?.symbol!==descriptor.feed)throw new Error('Unexpected instrument');
    const times=chart.timestamp,quote=chart.indicators?.quote?.[0];
    if(!Array.isArray(times)||!Array.isArray(quote?.high))throw new Error('Missing candles');
    const bars=[];
    for(let i=0;i<times.length;i++){
      const time=times[i]*1000,high=quote.high[i],volume=quote.volume?.[i];
      if(!Number.isFinite(time)||time>now||!Number.isFinite(high)||high<=0||volume===0)continue;
      const day=tradingDay(time);
      if(day.weekday===0||day.weekday===6)continue;
      bars.push({time,high,day:day.key});
    }
    bars.sort((a,b)=>a.time-b.time);
    if(!bars.length)throw new Error('No trading data');
    const latest=bars[bars.length-1],dayBars=bars.filter(bar=>bar.day===latest.day);
    let top=dayBars[0],touches=0;
    for(const bar of dayBars){if(bar.high>top.high){top=bar;touches=1;}else if(bar.high===top.high)touches++;}
    const end=Math.min(top.time+60000,now+1);
    return {symbol,feed:descriptor.feed,contract:String(chart.meta.shortName||descriptor.feed),day:latest.day,price:top.high,from:top.time,to:end,quarters:quarterRange(top.time,end),touches,firstBarAt:dayBars[0].time,lastBarAt:latest.time,barCount:dayBars.length};
  }
  const api={assets,tradingDay,quarters,quarterRange,summarize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DayHighs=api;
})(typeof globalThis==='undefined'?this:globalThis);
