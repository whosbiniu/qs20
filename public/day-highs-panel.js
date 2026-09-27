(() => {
  let running=false;
  const sourceText='Yahoo Finance · dane opóźnione około 10 min';
  function cell(row,text){const td=row.insertCell();td.textContent=text;return td;}
  function render(payload){
    if(!Array.isArray(payload.assets))throw new Error('Invalid data');
    for(const panel of DayHighs.panels){
      const body=document.getElementById(panel.id+'-body'),status=document.getElementById(panel.id+'-status');
      body.replaceChildren();let uncertain=false;const periods=new Set();
      for(const asset of DayHighs.assets){
        const item=payload.assets.find(item=>item.symbol===asset.symbol),value=item?.periods?.[panel.scope]?.[panel.side],row=body.insertRow();
        const label=cell(row,asset.symbol);label.title=`Yahoo: ${asset.feed}${item?.contract?' · '+item.contract:''}`;
        if(!value||value.error){const td=cell(row,value?.error||'Brak danych');td.colSpan=panel.keys.length+(panel.session?1:0);continue;}
        periods.add(value.period);
        const matches=DayHighs.matchingKeys(value.quarters,panel.keys);
        for(const key of panel.keys){
          const td=cell(row,value.quarters[key]);td.className='high-quarter';
          if(matches.includes(key)){td.classList.add('quarter-match');td.title='Co najmniej 3 poziomy wskazują ten sam Q.';}
          if(value.quarters[key].includes(' / ')){uncertain=true;td.title='Świeca przecina granicę kwartałów. Dokładny kwartał ekstremum jest nieznany.';}
          if(value.quarters[key]==='Q0')td.title='Tydzień przecina granicę miesięcy.';
        }
        if(panel.session){
          const td=cell(row,DayHighs.sessionLabel(value.quarters.daily));
          td.className='extreme-session';
          td.title='Sesja odpowiada kwartałowi Daily; nie jest liczona ponownie jako osobny poziom zgodności.';
        }
        label.title+=` · ${value.period}`;
      }
      const current=DayHighs.periodKey(DayHighs.tradingDay(Date.now()).key,panel.scope);
      const periodText=[...periods].map(value=>value.split('-').reverse().join('.')).join(' / ');
      const noun={day:'sesja',week:'tydzień od',month:'miesiąc'}[panel.scope];
      status.textContent=sourceText+(periods.size?` · ${[...periods].every(p=>p===current)?'':'ostatni dostępny okres · '}${noun} ${periodText}`:' · brak danych');
      if(payload.fetchedAt&&Date.now()-payload.fetchedAt>180000)status.textContent+=' · nieodświeżona kopia danych';
      if(uncertain)status.textContent+=' · dwa Q = granica wewnątrz świecy';
    }
  }
  async function refresh(){
    if(running)return;running=true;
    try{
      const endpoint=document.querySelector('meta[name="market-highs-endpoint"]').content;
      const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error('Unavailable');
      const payload=await response.json();
      if(payload.charts)payload.assets=DayHighs.assets.map(asset=>{
        const data=payload.charts[asset.symbol]||{};
        return DayHighs.summarizeAll(data.intraday,data.history,asset.symbol);
      });
      render(payload);
    }catch{DayHighs.panels.forEach(panel=>{document.getElementById(panel.id+'-status').textContent=sourceText+' · błąd odświeżania, widoczne dane mogą być nieaktualne';});}
    finally{running=false;}
  }
  // Inside the terminal this page is a frame: while it is not on screen, skip the 60 s Yahoo polls.
  let onScreen=true;
  window.addEventListener('message',e=>{if(e.source!==window.parent||e.data?.type!=='frame-visibility')return;const was=onScreen;onScreen=!!e.data.visible;if(onScreen&&!was)refresh();});
  refresh();setInterval(()=>{if(onScreen&&!document.hidden)refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&onScreen)refresh();});
})();
