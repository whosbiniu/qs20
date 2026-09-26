(() => {
  const body=document.getElementById('day-highs-body'),status=document.getElementById('day-highs-status');
  let running=false;
  function cell(row,text,small){const td=row.insertCell();td.textContent=text;if(small){const note=document.createElement('small');note.textContent=small;td.append(note);}return td;}
  function render(payload){
    if(!Array.isArray(payload.assets))throw new Error('Invalid data');
    body.replaceChildren();
    for(const asset of DayHighs.assets){
      const item=payload.assets.find(row=>row.symbol===asset.symbol),row=body.insertRow();
      const label=cell(row,asset.symbol);
      label.title=`Yahoo: ${asset.feed}${item?.contract?' · '+item.contract:''}`;
      if(!item||item.error){const td=cell(row,'Brak danych');td.colSpan=4;continue;}
      for(const key of ['weekly','daily','m90','micro']){
        const td=cell(row,item.quarters[key]);
        td.className='high-quarter';
        if(item.quarters[key].includes(' / '))td.title='Świeca minutowa przecina granicę kwartałów. Dokładny kwartał high jest nieznany.';
      }
    }
    const days=[...new Set(payload.assets.filter(item=>!item.error).map(item=>item.day))];
    const today=DayHighs.tradingDay(Date.now()).key;
    const dayLabel=days.map(day=>day.split('-').reverse().join('.')).join(' / ');
    status.textContent='Yahoo Finance · dane opóźnione około 10 min'+(days.length?` · ${days.every(day=>day===today)?'sesja':'ostatnia dostępna sesja'} ${dayLabel}`:' · notowania chwilowo niedostępne');
    if(days.length>1)Array.from(body.rows).forEach((row,i)=>{const item=payload.assets.find(item=>item.symbol===DayHighs.assets[i].symbol);if(item?.day){const small=document.createElement('small');small.textContent=item.day;row.cells[0].append(small);}});
    if(payload.fetchedAt&&Date.now()-payload.fetchedAt>180000)status.textContent+=' · nieodświeżona kopia danych';
    if(payload.assets.some(item=>!item.error&&Object.values(item.quarters).some(q=>q.includes(' / '))))status.textContent+=' · dwa Q = granica wewnątrz świecy 1 min';
  }
  async function refresh(){
    if(running)return;running=true;
    try{
      const endpoint=document.querySelector('meta[name="market-highs-endpoint"]').content;
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Unavailable');
      const payload=await response.json();
      // The native bridge returns provider candles; use the same calculations as the server.
      if(payload.charts)payload.assets=DayHighs.assets.map(asset=>{
        try{return DayHighs.summarize(payload.charts[asset.symbol],asset.symbol);}catch{return {...asset,error:'Dane chwilowo niedostępne'};}
      });
      render(payload);
    }catch{status.textContent='Nie udało się odświeżyć notowań. Widoczne dane mogą być nieaktualne; ponowimy za minutę.';}
    finally{running=false;}
  }
  refresh();setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
