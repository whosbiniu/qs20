(function(root){
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  // The timeline stores New York wall time in UTC-shaped timestamps.
  // Resolve the actual instant using the offset on the event date, not today.
  function toUTC(wall){
    const whole=Math.floor(wall/1000)*1000;
    let instant=whole;
    for(let i=0;i<4;i++){
      const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
      const displayed=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
      const difference=whole-displayed;
      if(!difference)return instant+(wall-whole);
      instant+=difference;
    }
    throw new Error('Nie można ustalić czasu wydarzenia w Nowym Jorku.');
  }
  function escapeText(value){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
  function fold(line){
    const encoder=new TextEncoder();let result='',length=0;
    for(const character of line){
      const bytes=encoder.encode(character).length;
      if(length+bytes>75){result+='\r\n ';length=1}
      result+=character;length+=bytes;
    }
    return result;
  }
  function stamp(ms){return new Date(ms).toISOString().replace(/[-:]/g,'').slice(0,15)+'Z'}
  function clock(ms){return new Date(ms).toISOString().slice(11,23).replace(/\.000$/,'').replace(/\.500$/,',5')}
  function event({name,q,start,end,scope='session'},now=Date.now()){
    const isDay=scope==='day',names=isDay?['Dzień']:['Azja','Londyn','NY AM','NY PM'];
    if(!['day','session'].includes(scope)||!names.includes(name)||![1,3,4].includes(q)||!Number.isFinite(start)||!Number.isFinite(end)||end-start!==(isDay?1350000:337500))throw new Error('Nieprawidłowe okno.');
    const id=`uncsway-${isDay?'day-':''}${start}-${q}`;
    const exact=`${new Date(start).toISOString().slice(0,10)} ${clock(start)} – ${new Date(end).toISOString().slice(0,10)} ${clock(end)} ET`;
    const chain=(isDay?['DAILY','90MIN','MICRO']:['90MIN','MICRO','NANO']).map(name=>`${name} Q${q}`).join(' / ');
    const description=`${chain}\nDokładne okno: ${exact}\n${isDay?'High Probability Low / High Dnia':'High Probability Okna w Sesji'}`;
    // iCalendar supports whole seconds. Round outward to contain the exact window.
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//UNCsWay//Session Windows//PL','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${id}@uncsway.local`,`DTSTAMP:${stamp(now)}`,`DTSTART:${stamp(Math.floor(toUTC(start)/1000)*1000)}`,`DTEND:${stamp(Math.ceil(toUTC(end)/1000)*1000)}`,`SUMMARY:${escapeText(`High Probability · ${name} · Q${q} ×3`)}`,`DESCRIPTION:${escapeText(description)}`,'TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'];
    return {filename:id+'.ics',ics:lines.map(fold).join('\r\n')+'\r\n'};
  }
  const api={toUTC,event};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.SessionCalendar=api;
})(typeof globalThis==='undefined'?this:globalThis);
