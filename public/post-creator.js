window.PostCreator = (() => {
  const root = document.getElementById('post-creator')
  const tickers = ['NQ1!','ES1!','YM1!','RTY1!','SI1!','GC1!','PL1!','HO1!','CL1!','RB1!','BTC1!','ETH1!','TOTAL3','6E1!','6B1!','DXY','EURUSD','GBPUSD','XAUUSD','XAUEUR','XAUGBP','XAGUSD','XAGEUR','XAGGBP','BTCUSD','ETHUSD','US100','US500','US30','US2000','XYZ100','SP500']
  const initial = () => ({ version: 2, activePanel: 'charts', ticker: 'NQ1!', timeframe: 'H1', canvasWidth: 4096, canvasHeight: 2840, background: null, charts: [], showBadge: true, showHeader: true, showLines: true, badgeX: .077, badgeY: .47, badgeScale: 1, displayName: 'biniu.B3', handle: '@biniub3', avatar: null, aura: { textColor: '#fff', ticker: 'NQ1!', ticks: '663', rr: '8.3', date: new Date().toISOString().slice(0,10), photo: null, videoName: null, textScale: 1, profileScale: 1, width: 2160, height: 2880, zoom: 1, positionX: .5, positionY: .5, dim: 0, footerShade: .16, footerMargin: .025, showBrand: true, showAvatar: true, showRR: true, showTicks: true, showDate: true, showIcon: true }, thesis: { ticker: '6E1!', width: 2885, height: 2000, count: 2, panels: [{ image: null, timeframe: '1D' }, { image: null, timeframe: 'H4' }, { image: null, timeframe: 'm15' }], text: '', accent: '#1f63c6', background: '#f4f4f4', textScale: 1, showProfile: true, showAvatar: true, showWheel: true } })
  // Thesis timeframes, highest first: the wheel under each chart shows the chosen one and its neighbours.
  const TF = ['1M','1W','1D','H6','H4','H1','m90','m30','m15','m5','m4','m3','m1']
  const merge = saved => { const base = initial(), t = { ...base.thesis, ...saved?.thesis }; t.panels = base.thesis.panels.map((p, i) => ({ ...p, ...(Array.isArray(saved?.thesis?.panels) ? saved.thesis.panels[i] : null) })); return { ...base, ...saved, aura: { ...base.aura, ...saved?.aura }, thesis: t } }
  let project = initial(), selected = -1, images = new Map(), drag = null, panel = 0
  try { const saved = JSON.parse(localStorage.getItem('postcreator-project') || 'null'); if (saved?.version === 2) project = merge(saved) } catch {}
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
  const $ = id => document.getElementById(id)
  root.innerHTML = `<div class="pc"><aside class="pc-controls"><h3>POST CREATOR</h3><div class="pc-tabs"><button data-mode="charts">Wykresy</button><button data-mode="aura">Aura</button><button data-mode="thesis">Teza</button></div><div id="pc-fields"></div></aside><div class="pc-stage"><div class="pc-top"><span id="pc-mode-title">Wykresy</span><div class="pc-spacer"></div><button id="pc-open">Otwórz projekt</button><button id="pc-save">Zapisz projekt</button><button id="pc-export">Eksportuj PNG</button><button id="pc-copy">Kopiuj PNG</button></div><div class="pc-preview" id="pc-drop"><canvas id="pc-canvas" aria-label="Podgląd grafiki"></canvas></div><div id="pc-video-controls" hidden><button id="pc-video-play">Odtwórz</button><input id="pc-video-seek" type="range" min="0" max="0" step="0.05" value="0" aria-label="Pozycja filmu"><span id="pc-video-time"></span></div><button id="pc-video-cancel" hidden>Anuluj eksport MP4</button><div class="pc-status" id="pc-status" role="status">Wklej obraz (⌘V), przeciągnij plik lub wybierz go w panelu.</div></div><input type="file" id="pc-file" accept="image/*" hidden><input type="file" id="pc-project-file" accept=".postcreator,application/json" hidden></div>`
  const canvas = $('pc-canvas'), ctx = canvas.getContext('2d')
  const status = s => $('pc-status').textContent = s
  const video = new PostCreatorVideo({draw,status,changed(name){project.aura.videoName=name;project.aura.photo=null;update()},busy(value){root.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);$('pc-video-cancel').hidden=!value;$('pc-video-cancel').disabled=false;if(!value)controls()}})
  const auraVideo = () => project.activePanel==='aura' && !!project.aura.videoName
  const videoSize = () => {const a=project.aura,w=Math.min(1080,Number(a.width));return {width:Math.round(w/2)*2,height:Math.round(w*Number(a.height)/Number(a.width)/2)*2}}
  $('pc-video-play').onclick=()=>video.toggle().catch(error=>status(error.message))
  $('pc-video-seek').oninput=e=>video.seek(e.target.value)
  $('pc-video-cancel').onclick=()=>video.cancel?.()
  const check = (name, label, value) => `<label class="pc-check"><input type="checkbox" data-field="${name}" ${value ? 'checked' : ''}>${label}</label>`
  const field = (name, label, value, type='text', extra='') => `<label>${label}<input data-field="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></label>`
  const select = (name, label, value, options) => `<label>${label}<select data-field="${name}">${options.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`
  const quickSelect = (mode, value) => `<div class="pc-quick-title">Quick Select</div><div class="pc-quick" role="group" aria-label="Wybierz ticker">${tickers.map(ticker => `<button type="button" data-ticker="${ticker}" data-for="${mode}" class="${ticker === value ? 'active' : ''}" aria-label="Wybierz ${ticker}" aria-pressed="${ticker === value}"><img src="${PostCreatorIcons.image(ticker)}" alt=""><span>${ticker}</span></button>`).join('')}</div>`
  function controls() {
    const a = project.aura, mode = project.activePanel
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode))
    $('pc-mode-title').textContent = mode === 'aura' ? 'Aura · zdjęcie lub film z wynikiem' : mode === 'thesis' ? 'Teza · wykresy z interwałami i opisem' : 'Wykresy · grafika tradingowa'
    $('pc-export').textContent=auraVideo()?'Eksportuj MP4':'Eksportuj PNG'
    $('pc-copy').disabled=auraVideo()
    $('pc-video-controls').hidden=!auraVideo()||!video.ready
    video.sync()
    const common = `<fieldset><legend>Profil</legend>${field('displayName','Nazwa profilu',project.displayName)}${field('handle','Handle',project.handle)}<button data-action="avatar">Wybierz avatar</button></fieldset>`
    const chart = `<fieldset><legend>Instrument</legend>${select('ticker','Ticker',project.ticker,tickers.map(x => [x,x]))}${field('timeframe','Interwał',project.timeframe)}${select('format','Format',`${project.canvasWidth}x${project.canvasHeight}`,[['4096x2840','Poziomy 4096 × 2840'],['3000x3000','Kwadrat 3000 × 3000'],['2400x3000','Pion 4:5'],['2160x3840','Story 9:16']])}${quickSelect('charts',project.ticker)}</fieldset>
      <fieldset><legend>Obrazy</legend><div class="pc-actions"><button data-action="chart">Dodaj wykres</button><button data-action="background">Podkład</button></div><div class="pc-layers">${project.charts.map((c,i) => `<button data-layer="${i}" class="${selected === i ? 'active' : ''}">${i+1}. ${esc(c.name || 'Wykres')}</button>`).join('')}</div>${selected >= 0 ? `<div class="pc-actions"><button data-action="up">Wyżej</button><button data-action="down">Niżej</button><button data-action="remove">Usuń</button></div>${select('fit','Dopasowanie',project.charts[selected]?.fit || 'fit',[['fit','Cały obraz'],['fill','Wypełnij ramkę']])}${field('opacity','Przezroczystość',project.charts[selected]?.opacity ?? 1,'range','min="0" max="1" step="0.05"')}` : ''}</fieldset>
      <fieldset><legend>Elementy</legend>${check('showHeader','Nagłówek',project.showHeader)}${check('showLines','Linie nagłówka',project.showLines)}${check('showBadge','Etykieta tickeru',project.showBadge)}${field('badgeScale','Skala etykiety',project.badgeScale,'range','min="0.5" max="2" step="0.05"')}</fieldset>`
    const aura = `<fieldset><legend>Wynik</legend>${select('aura.textColor','Kolor napisów',a.textColor,[['#fff','Biały'],['#000','Czarny']])}${select('aura.ticker','Ticker',a.ticker,tickers.map(x => [x,x]))}<div class="pc-row">${field('aura.ticks','Ticki',a.ticks)}${field('aura.rr','Wynik w R',a.rr)}</div>${field('aura.date','Data',a.date,'date')}${select('aura.format','Format',`${a.width}x${a.height}`,[['2160x2880','3:4 · 2160 × 2880'],['2160x2700','4:5 · 2160 × 2700'],['2160x3840','9:16 · 2160 × 3840'],['2160x2160','Kwadrat · 2160 × 2160']])}${quickSelect('aura',a.ticker)}</fieldset>
      <fieldset><legend>Zdjęcie lub film</legend><div class="pc-actions"><button data-action="photo">Dodaj zdjęcie</button><button data-action="video">Dodaj MP4</button></div>${a.videoName ? `<p class="pc-media-note">${esc(a.videoName)}${video.ready ? "" : " · wybierz ponownie źródłowy MP4"}</p><button data-action="remove-video">Usuń film</button>` : ""}${field('aura.zoom','Powiększenie',a.zoom,'range','min="1" max="4" step="0.05"')}${field('aura.positionX','Kadr w poziomie',a.positionX,'range','min="0" max="1" step="0.01"')}${field('aura.positionY','Kadr w pionie',a.positionY,'range','min="0" max="1" step="0.01"')}${field('aura.dim','Przyciemnienie',a.dim,'range','min="0" max="1" step="0.05"')}${field('aura.footerShade','Cień pod wynikiem',a.footerShade,'range','min="0" max="1" step="0.05"')}${field('aura.footerMargin','Odstęp od dołu',a.footerMargin,'range','min="0" max="0.3" step="0.005"')}</fieldset>
      <fieldset><legend>Rozmiar nakładki</legend>${field("aura.textScale","Wynik, ticker i data",a.textScale,"range",'min="0.3" max="1.5" step="0.05"')}${field("aura.profileScale","Profil i avatar",a.profileScale,"range",'min="0.3" max="1.5" step="0.05"')}<p class="pc-media-note">PNG: ${a.width} × ${a.height} · MP4: ${videoSize().width} × ${videoSize().height}, 30 kl./s</p></fieldset><fieldset><legend>Widoczność</legend>${check('aura.showBrand','Profil',a.showBrand)}${check('aura.showAvatar','Zdjęcie profilowe',a.showAvatar)}${check('aura.showRR','Wynik R',a.showRR)}${check('aura.showTicks','Ticki',a.showTicks)}${check('aura.showDate','Data',a.showDate)}${check('aura.showIcon','Ikona',a.showIcon)}</fieldset>`
    const t = project.thesis, tp = t.panels[Math.min(panel, t.count - 1)]
    const thesis = `<fieldset><legend>Asset</legend>${select('thesis.ticker','Ticker',t.ticker,tickers.map(x => [x,x]))}${select('thesis.format','Format',`${t.width}x${t.height}`,[['2885x2000','Poziomy 2885 × 2000'],['3840x2160','16:9 · 3840 × 2160'],['3000x3000','Kwadrat 3000 × 3000'],['2400x3000','Pion 4:5']])}${quickSelect('thesis',t.ticker)}</fieldset>
      <fieldset><legend>Wykresy</legend>${select('thesis.count','Liczba wykresów',String(t.count),[['1','1 wykres'],['2','2 wykresy'],['3','3 wykresy']])}<div class="pc-actions" role="group" aria-label="Wybierz wykres">${t.panels.slice(0,t.count).map((p,i) => `<button data-panel="${i}" class="${i === panel ? 'active' : ''}" aria-pressed="${i === panel}">${i+1} · ${esc(p.timeframe)}${p.image ? '' : ' · pusty'}</button>`).join('')}</div>
      <div class="pc-quick-title">Interwał wykresu ${panel+1}</div><div class="pc-tf" role="group" aria-label="Interwał">${TF.map(x => `<button data-tf="${x}" class="${x === tp.timeframe ? 'active' : ''}" aria-pressed="${x === tp.timeframe}">${x}</button>`).join('')}</div>
      <div class="pc-actions"><button data-action="thesis-image">${tp.image ? 'Zmień obraz' : 'Dodaj obraz'}</button>${tp.image ? '<button data-action="thesis-clear">Usuń obraz</button>' : ''}</div><p class="pc-media-note">Wklej (⌘V) lub przeciągnij wykres – trafi do zaznaczonego okna i zawsze będzie wyśrodkowany.</p></fieldset>
      <fieldset><legend>Opis tezy</legend><label>Tekst<textarea data-field="thesis.text" rows="6" placeholder="Np. tygodniowa świeca rozszerza się w dół…">${esc(t.text)}</textarea></label>${field('thesis.textScale','Wielkość tekstu',t.textScale,'range','min="0.6" max="1.6" step="0.05"')}</fieldset>
      <fieldset><legend>Wygląd</legend>${select('thesis.accent','Akcent',t.accent,[['#1f63c6','Niebieski'],['#0f9d6b','Zielony'],['#d23c3c','Czerwony'],['#e07b16','Pomarańczowy'],['#111111','Czarny']])}${select('thesis.background','Tło',t.background,[['#f4f4f4','Jasne'],['#ffffff','Białe'],['#111214','Ciemne']])}${check('thesis.showWheel','Koło interwałów',t.showWheel)}${check('thesis.showProfile','Profil',t.showProfile)}${check('thesis.showAvatar','Zdjęcie profilowe',t.showAvatar)}</fieldset>`
    $('pc-fields').innerHTML = (mode === 'aura' ? aura : mode === 'thesis' ? thesis : chart) + common
  }
  function getImage(data) {
    if (!data) return null
    if (!images.has(data)) { const img = new Image(); img.onload = draw; img.src = data.startsWith('data:') || data.startsWith('/') ? data : 'data:image/png;base64,' + data; images.set(data, img) }
    const img = images.get(data); return img.complete && img.naturalWidth ? img : null
  }
  function placeImage(c, img, x, y, w, h, fit='fit', opacity=1) {
    if (!img) return
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip(); c.globalAlpha = opacity
    const sourceWidth=img.videoWidth||img.width,sourceHeight=img.videoHeight||img.height
    const scale = fit === 'fill' ? Math.max(w/sourceWidth,h/sourceHeight) : Math.min(w/sourceWidth,h/sourceHeight)
    const iw = sourceWidth*scale, ih=sourceHeight*scale
    c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih); c.restore()
  }
  function badge(c,ticker,x,y,size) {
    PostCreatorIcons.draw(c,ticker,x,y,size)
  }
  function render(c,w,h,preview=false) {
    c.clearRect(0,0,w,h); c.save()
    if (project.activePanel === 'aura') {
      const a=project.aura; c.fillStyle='#202330';c.fillRect(0,0,w,h)
      const photo=a.videoName ? (video.ready?video.video:null) : getImage(a.photo)
      if (photo) { const sw=photo.videoWidth||photo.width,sh=photo.videoHeight||photo.height;const scale=Math.max(w/sw,h/sh)*Number(a.zoom); const pw=sw*scale,ph=sh*scale; placeImage(c,photo,-(pw-w)*Number(a.positionX),-(ph-h)*Number(a.positionY),pw,ph,'fill') }
      c.fillStyle=`rgba(0,0,0,${a.dim})`;c.fillRect(0,0,w,h)
      // One margin for every edge and one baseline grid for the footer, so the overlay stays evenly spaced at any scale.
      const s=w/416,ts=s*Math.max(.3,Math.min(1.5,Number(a.textScale)||1)),ps=s*Math.max(.3,Math.min(1.5,Number(a.profileScale)||1)),pad=18*s
      const lead=28*ts,b2=h-h*Number(a.footerMargin)-pad,b1=b2-lead,cap=21*ts*.72,blockTop=b1-cap,mid=(blockTop+b2)/2
      const grad=c.createLinearGradient(0,blockTop-90*s,0,h);grad.addColorStop(0,'transparent');grad.addColorStop(1,`rgba(0,0,0,${a.footerShade})`);c.fillStyle=grad;c.fillRect(0,blockTop-90*s,w,h-blockTop+90*s)
      c.fillStyle=a.textColor === '#000' ? '#000' : '#fff';c.textAlign='left';c.textBaseline='alphabetic'
      if (a.showBrand) {
        let y=pad
        if (a.showAvatar!==false) { const d=60*ps,av=getImage(project.avatar || '/postcreator-avatar.jpg'); if (av) {c.save();c.beginPath();c.arc(pad+d/2,y+d/2,d/2,0,Math.PI*2);c.clip();placeImage(c,av,pad,y,d,d,'fill');c.restore()} y+=d+10*ps }
        c.font=`bold ${14*ps}px Arial`;c.fillText(project.displayName,pad,y+14*ps*.8);c.font=`${12*ps}px Arial`;c.fillText(project.handle,pad,y+14*ps*.8+18*ps)
      }
      // Baselines of a column: two lines on the grid, a single line centred on the block.
      const rows=n=>n===2?[b1,b2]:[mid+cap/2]
      const signed=v=>!v ? '' : /^[+\-−]/.test(String(v)) ? String(v) : '+'+v
      const left=[a.showRR&&signed(a.rr)+'R',a.showTicks&&signed(a.ticks)+' Ticks'].filter(Boolean)
      c.font=`bold ${21*ts}px Arial`;rows(left.length).forEach((y,i)=>left[i]&&c.fillText(left[i],pad,y))
      const d=a.date?.split('-'),centre=[[a.ticker,`bold ${24*ts}px Arial`],a.showDate&&d?.length===3&&[`${d[2]}/${d[1]}/${d[0]}`,`${15*ts}px Arial`]].filter(Boolean)
      c.textAlign='center';rows(centre.length).forEach((y,i)=>{c.font=centre[i][1];c.fillText(centre[i][0],w/2,y)})
      if(a.showIcon){const size=b2-blockTop+10*ts;badge(c,a.ticker,w-pad-size,mid-size/2,size)}
    } else if (project.activePanel === 'thesis') {
      renderThesis(c,w,h,preview)
    } else {
      c.fillStyle='#fff';c.fillRect(0,0,w,h)
      placeImage(c,getImage(project.background),0,0,w,h,'fill')
      project.charts.forEach((layer,i)=>{placeImage(c,getImage(layer.data),layer.x*w,layer.y*h,layer.width*w,layer.height*h,layer.fit,layer.opacity);if(preview&&i===selected){c.strokeStyle='#00a6ca';c.lineWidth=Math.max(2,w/600);c.strokeRect(layer.x*w,layer.y*h,layer.width*w,layer.height*h);c.fillStyle='#00a6ca';c.fillRect((layer.x+layer.width)*w-8,(layer.y+layer.height)*h-8,16,16)}})
      const s=w/1200
      if(project.showHeader){if(project.showLines){c.strokeStyle='#999';c.lineWidth=s;c.beginPath();c.moveTo(w*.05,48*s);c.lineTo(w*.428,48*s);c.moveTo(w*.572,48*s);c.lineTo(w*.95,48*s);c.stroke()}const av=getImage(project.avatar||'/postcreator-avatar.jpg');if(av){c.save();c.beginPath();c.arc(w/2,48*s,31*s,0,Math.PI*2);c.clip();placeImage(c,av,w/2-31*s,17*s,62*s,62*s,'fill');c.restore()}c.textAlign='center';c.fillStyle='#111';c.font=`bold ${16*s}px Arial`;c.fillText(project.displayName,w/2,100*s);c.fillStyle='#888';c.font=`${12*s}px Arial`;c.fillText(project.handle,w/2,118*s)}
      if(project.showBadge){const x=project.badgeX*w,y=project.badgeY*h,z=s*project.badgeScale;badge(c,project.ticker,x,y,51*z);c.textAlign='left';c.textBaseline='alphabetic';c.fillStyle='#151515';c.font=`bold ${27*z}px Arial`;const name=project.ticker.endsWith('1!')?project.ticker.slice(0,-2):project.ticker;c.fillText(name,x+62*z,y+30*z);if(name!==project.ticker){const width=c.measureText(name).width;c.fillStyle='#b5b5b5';c.fillText('1!',x+62*z+width,y+30*z)}c.fillStyle=PostCreatorIcons.color(project.ticker);c.font=`${26*z}px Arial`;c.fillText(project.timeframe,x+62*z,y+64*z)}
    }
    c.restore()
  }
  // Thesis layout in units of the 2000-wide reference: header, chart windows, timeframe wheels, centred text.
  function thesisBoxes(w,h){
    const t=project.thesis,u=w/2000,n=Math.max(1,Math.min(3,Number(t.count)||2)),x0=120*u,x1=w-120*u,gap=90*u,bw=(x1-x0-gap*(n-1))/n
    const top=175*u,wheel=t.showWheel?h-292*u:h-250*u,bottom=wheel-(t.showWheel?80*u:40*u)
    return Array.from({length:n},(_,i)=>({x:x0+i*(bw+gap),y:top,w:bw,h:Math.max(40*u,bottom-top),wheel}))
  }
  function wrap(c,text,max){
    const lines=[]
    for(const para of String(text||'').split('\n')){let line='';for(const word of para.split(/\s+/).filter(Boolean)){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>max){lines.push(line);line=word}else line=next}lines.push(line)}
    while(lines.length&&!lines.at(-1))lines.pop()
    return lines
  }
  function renderThesis(c,w,h,preview){
    const t=project.thesis,u=w/2000,dark=t.background==='#111214',ink=dark?'#f2f2f2':'#141414',soft=dark?'#8a8a8a':'#9a9a9a',faint=dark?'#4a4a4a':'#cfcfcf'
    const font=(size,weight=400)=>`${weight} ${size*u}px -apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif`
    c.fillStyle=t.background;c.fillRect(0,0,w,h)
    // Header: instrument badge and ticker (the continuous-contract "1!" greyed), profile on the right.
    badge(c,t.ticker,73*u,52*u,84*u)
    c.textAlign='left';c.textBaseline='alphabetic';c.font=font(46,700);c.fillStyle=ink
    const name=t.ticker.endsWith('1!')?t.ticker.slice(0,-2):t.ticker;c.fillText(name,180*u,111*u)
    if(name!==t.ticker){c.fillStyle=faint;c.fillText('1!',180*u+c.measureText(name).width,111*u)}
    if(t.showProfile){
      let right=w-73*u
      if(t.showAvatar){const av=getImage(project.avatar||'/postcreator-avatar.jpg');if(av){c.save();c.beginPath();c.arc(right-43*u,94*u,43*u,0,Math.PI*2);c.clip();placeImage(c,av,right-86*u,51*u,86*u,86*u,'fill');c.restore()}right-=86*u+16*u}
      c.textAlign='right';c.fillStyle=ink;c.font=font(27,700);c.fillText(project.displayName,right,88*u);c.fillStyle=soft;c.font=font(27);c.fillText(project.handle,right,120*u)
    }
    thesisBoxes(w,h).forEach((box,i)=>{
      const p=t.panels[i],img=getImage(p.image)
      if(img)placeImage(c,img,box.x,box.y,box.w,box.h,'fit')
      else if(preview){c.save();c.strokeStyle=faint;c.setLineDash([10*u,8*u]);c.lineWidth=2*u;c.strokeRect(box.x,box.y,box.w,box.h);c.fillStyle=soft;c.textAlign='center';c.font=font(26);c.fillText(`Wykres ${i+1} · wklej (⌘V) lub przeciągnij`,box.x+box.w/2,box.y+box.h/2);c.restore()}
      if(preview&&i===panel&&t.count>1){c.save();c.strokeStyle=t.accent;c.globalAlpha=.55;c.lineWidth=3*u;c.strokeRect(box.x-8*u,box.y-8*u,box.w+16*u,box.h+16*u);c.restore()}
      if(!t.showWheel)return
      // Timeframe wheel: the chosen one large in the accent colour, two neighbours each side fading out, dots underneath.
      const k=Math.max(0,TF.indexOf(p.timeframe)),sizes=[16,24,58,24,16],colors=[faint,soft,t.accent,soft,faint],dots=[3,4.5,8,4.5,3]
      const items=[-2,-1,0,1,2].map((o,j)=>({label:TF[k+o],size:sizes[j],color:colors[j],dot:dots[j],weight:o?400:700})).filter(x=>x.label)
      const space=20*u;items.forEach(x=>{c.font=font(x.size,x.weight);x.width=c.measureText(x.label).width})
      const active=items.findIndex(x=>x.label===p.timeframe),cx=box.x+box.w/2
      let pos=cx-items[active].width/2;for(let j=active-1;j>=0;j--){pos-=space+items[j].width;items[j].x=pos}pos=cx-items[active].width/2;items[active].x=pos;pos+=items[active].width;for(let j=active+1;j<items.length;j++){items[j].x=pos+space;pos=items[j].x+items[j].width}
      c.textAlign='left';items.forEach(x=>{c.font=font(x.size,x.weight);c.fillStyle=x.color;c.fillText(x.label,x.x,box.wheel+(x.size===58?16*u:0));c.beginPath();c.arc(x.x+x.width/2,box.wheel+40*u,x.dot*u,0,Math.PI*2);c.fill()})
    })
    // Description: centred, wrapped, its block centred on the same line whatever its length.
    const scale=Math.max(.6,Math.min(1.6,Number(t.textScale)||1)),size=24*scale,lh=size*1.3*u;c.font=font(size);c.fillStyle=ink;c.textAlign='center'
    const lines=wrap(c,t.text,w-500*u),y0=h-140*u-(lines.length-1)*lh/2
    lines.forEach((line,i)=>c.fillText(line,w/2,y0+i*lh))
  }
  const dims=()=>{const m=project.activePanel,a=project.aura,t=project.thesis;return m==='aura'?[a.width,a.height]:m==='thesis'?[t.width,t.height]:[project.canvasWidth,project.canvasHeight]}
  function draw() { const [dw,dh]=dims(),ratio=dh/dw;if(canvas.width!==1000||canvas.height!==Math.round(1000*ratio)){canvas.width=1000;canvas.height=Math.round(1000*ratio)}render(ctx,canvas.width,canvas.height,true) }
  function saveLocal(){try{localStorage.setItem('postcreator-project',JSON.stringify(project))}catch{status('Projekt jest zbyt duży dla autozapisu. Użyj „Zapisz projekt”.')}}
  function update(){controls();draw();saveLocal()}
  function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
  let fileTarget='chart'
  async function addFile(file,target=fileTarget){
    if(!file||video.exporting)return
    try {
      if(target==='video'||(target==='photo'&&(file.type==='video/mp4'||/\.mp4$/i.test(file.name)))){if(await video.load(file))status('Wczytano MP4. Ustaw nakładkę i wybierz Eksportuj MP4. Projekt zapisuje ustawienia; po otwarciu wskaż film ponownie.');return}
      if(!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(file.name||''))throw Error('Wybierz plik obrazu, np. PNG lub JPG.')
      let data=await fileData(file)
      const img=new Image()
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Nie można odczytać obrazu. Spróbuj pliku PNG lub JPG.'));img.src=data})
      if(target==='avatar'){
        const size=Math.min(512,img.naturalWidth,img.naturalHeight),out=document.createElement('canvas')
        out.width=size;out.height=size
        placeImage(out.getContext('2d'),img,0,0,size,size,'fill')
        data=out.toDataURL('image/png')
        project.avatar=data;project.showHeader=true;project.aura.showBrand=true
      }else if(target==='photo'){video.clear();project.aura.videoName=null;project.aura.photo=data;Object.assign(project.aura,{positionX:.5,positionY:.5})}
      else if(target==='thesis'){const t=project.thesis;t.panels[panel].image=data;const next=t.panels.slice(0,t.count).findIndex(p=>!p.image);if(next>=0)panel=next}
      else if(target==='background'){project.background=data;project.showHeader=false}
      else{
        if(project.charts.length>=8){status('Maksymalnie 8 wykresów.');return}
        // Always centred, at its own proportions, as large as fits in 70% of the canvas.
        let width=.7,height=width*(img.naturalHeight/img.naturalWidth)*(project.canvasWidth/project.canvasHeight)
        if(height>.7){width*=.7/height;height=.7}
        project.charts.push({name:file.name||'Wykres',data,x:(1-width)/2,y:(1-height)/2,width,height,fit:'fit',opacity:1});selected=project.charts.length-1
      }
      status(target==='avatar'?'Wczytano avatar.':target==='chart'?'Dodano wykres na środku. Przeciągnij go na podglądzie, aby zmienić pozycję.':target==='thesis'?'Dodano wykres do tezy.':'Dodano obraz.')
      update()
    }catch(error){status('Nie udało się wczytać obrazu: '+error.message)}
  }
  root.addEventListener('click',e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(video.exporting)return;if(mode){video.video.pause();project.activePanel=mode;selected=-1;update();return}const chosen=e.target.closest('[data-ticker]');if(chosen){const f=chosen.dataset.for;if(f==='aura')project.aura.ticker=chosen.dataset.ticker;else if(f==='thesis')project.thesis.ticker=chosen.dataset.ticker;else project.ticker=chosen.dataset.ticker;update();return}const pick=e.target.closest('[data-panel]')?.dataset.panel;if(pick!==undefined){panel=Number(pick);update();return}const tf=e.target.closest('[data-tf]')?.dataset.tf;if(tf){project.thesis.panels[panel].timeframe=tf;update();return}const layer=e.target.closest('[data-layer]')?.dataset.layer;if(layer!==undefined){selected=Number(layer);update();return}const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='remove-video'){video.clear();project.aura.videoName=null;update();return}if(action==='thesis-clear'){project.thesis.panels[panel].image=null;update();return}if(action==='thesis-image'){fileTarget='thesis';$('pc-file').accept='image/*';$('pc-file').click();return}if(['chart','photo','background','avatar','video'].includes(action)){fileTarget=action;$('pc-file').accept=action==='video'?'video/mp4,.mp4':'image/*';$('pc-file').click();return}if(selected<0)return;if(action==='remove'){project.charts.splice(selected,1);selected=-1}else if(action==='up'&&selected<project.charts.length-1){[project.charts[selected],project.charts[selected+1]]=[project.charts[selected+1],project.charts[selected]];selected++}else if(action==='down'&&selected>0){[project.charts[selected],project.charts[selected-1]]=[project.charts[selected-1],project.charts[selected]];selected--}update()})
  root.addEventListener('input',e=>{const key=e.target.dataset.field;if(!key||video.exporting)return;let value=e.target.type==='checkbox'?e.target.checked:e.target.value;if(e.target.type==='range')value=Number(value);if(key==='format'){[project.canvasWidth,project.canvasHeight]=value.split('x').map(Number)}else if(key==='aura.format'){[project.aura.width,project.aura.height]=value.split('x').map(Number)}else if(key==='thesis.format'){[project.thesis.width,project.thesis.height]=value.split('x').map(Number)}else if(key==='thesis.count'){project.thesis.count=Number(value);panel=Math.min(panel,project.thesis.count-1);controls()}else if(key.startsWith('thesis.'))project.thesis[key.slice(7)]=value;else if(['fit','opacity'].includes(key)){if(project.charts[selected])project.charts[selected][key]=value}else if(key.startsWith('aura.'))project.aura[key.slice(5)]=value;else project[key]=value;if(key==='ticker'||key==='aura.ticker'||key==='thesis.ticker')controls();draw();saveLocal()})
  $('pc-file').onchange=e=>{addFile(e.target.files[0]);e.target.value=''}
  $('pc-open').onclick=()=>$('pc-project-file').click()
  $('pc-project-file').onchange=async e=>{try{const incoming=JSON.parse(await e.target.files[0].text());if(!incoming||!Array.isArray(incoming.charts))throw Error('Nieprawidłowy plik');video.clear();project=merge(incoming);selected=-1;panel=0;images.clear();update();status('Otworzono projekt.')}catch(err){status(err.message)}e.target.value=''}
  const asBase64 = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})
  async function download(blob,name){
    if(window.webkit?.messageHandlers?.postCreatorFile){
      if(name.endsWith('.mp4')){
        const bridge=window.webkit.messageHandlers.postCreatorFile
        const {id}=await bridge.postMessage({action:'videoStart',filename:name})
        try {for(let offset=0;offset<blob.size;offset+=1024*1024)await bridge.postMessage({action:'videoChunk',id,data:await asBase64(blob.slice(offset,offset+1024*1024))});const result=await bridge.postMessage({action:'videoFinish',id});return !result.cancelled}
        catch(error){await bridge.postMessage({action:'videoCancel',id}).catch(()=>{});throw error}
      }
      const result=await window.webkit.messageHandlers.postCreatorFile.postMessage({action:'save',filename:name,data:await asBase64(blob)})
      return !result.cancelled
    }
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)
    return true
  }
  $('pc-save').onclick=async()=>{try{if(await download(new Blob([JSON.stringify(project)],{type:'application/json'}),`${project.ticker||'PostCreator'}.postcreator`))status('Zapisano projekt.')}catch(error){status('Nie udało się zapisać projektu: '+error.message)}}
  async function exportBlob(){const out=document.createElement('canvas');[out.width,out.height]=dims();render(out.getContext('2d'),out.width,out.height);return new Promise(resolve=>out.toBlob(resolve,'image/png'))}
  $('pc-export').onclick=async()=>{if(video.exporting)return;if(auraVideo()){try{draw();await Promise.all([...images.values()].map(img=>img.decode().catch(()=>{})));const size=videoSize(),blob=await video.export({...size,render});if(await download(blob,`PostCreator-aura-${Date.now()}.mp4`))status(`Wyeksportowano MP4 ${size.width} × ${size.height} z nakładką i dźwiękiem.`);else status('Anulowano zapis MP4.')}catch(error){status(error.name==='AbortError'?'Anulowano eksport MP4.':'Nie udało się wyeksportować MP4: '+error.message)}return}try{const blob=await exportBlob();if(blob&&await download(blob,`PostCreator-${project.activePanel}-${Date.now()}.png`))status(`Wyeksportowano ${dims().join(' × ')} PNG.`)}catch(error){status('Nie udało się wyeksportować PNG: '+error.message)}}
  $('pc-copy').onclick=async()=>{try{const blob=await exportBlob();if(window.webkit?.messageHandlers?.postCreatorFile)await window.webkit.messageHandlers.postCreatorFile.postMessage({action:'copy',data:await asBase64(blob)});else await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status('Skopiowano PNG.')}catch{status('Kopiowanie obrazu jest niedostępne. Użyj eksportu PNG.')}}
  const target=()=>({aura:'photo',thesis:'thesis'})[project.activePanel]||'chart'
  const drop=$('pc-drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('pc-drop')});drop.addEventListener('dragleave',()=>drop.classList.remove('pc-drop'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('pc-drop');addFile(e.dataTransfer.files[0],target())})
  root.addEventListener('paste',e=>{const file=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();addFile(file,target())}})
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return
    const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height
    if(project.activePanel==='thesis'&&!video.exporting){const hit=thesisBoxes(1,canvas.height/canvas.width).findIndex(b=>x>=b.x&&x<=b.x+b.w);if(hit>=0){panel=hit;update();if(!project.thesis.panels[hit].image){fileTarget='thesis';$('pc-file').accept='image/*';$('pc-file').click()}}return}
    if(project.activePanel!=='charts')return
    for(let i=project.charts.length-1;i>=0;i--){
      const l=project.charts[i]
      if(x>=l.x&&x<=l.x+l.width&&y>=l.y&&y<=l.y+l.height){
        selected=i;drag={index:i,kind:x>l.x+l.width-.025&&y>l.y+l.height-.025?'resize':'move',x,y,ox:l.x,oy:l.y,ow:l.width,oh:l.height}
        controls();draw();canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';break
      }
    }
  })
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return
    const l=project.charts[drag.index]
    if(!l||project.activePanel!=='charts')return
    const r=canvas.getBoundingClientRect(),dx=(e.clientX-r.left)/r.width-drag.x,dy=(e.clientY-r.top)/r.height-drag.y
    if(drag.kind==='move'){l.x=Math.max(0,Math.min(1-l.width,drag.ox+dx));l.y=Math.max(0,Math.min(1-l.height,drag.oy+dy))}
    else{l.width=Math.max(.08,Math.min(1-l.x,drag.ow+dx));l.height=Math.max(.08,Math.min(1-l.y,drag.oh+dy))}
    draw()
  })
  function endDrag(){if(drag){drag=null;saveLocal()}canvas.style.cursor=''}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag)
  document.addEventListener('keydown',e=>{if(root.hidden||!(e.metaKey||e.ctrlKey))return;if(e.key.toLowerCase()==='e'){e.preventDefault();$('pc-export').click()}else if(e.key.toLowerCase()==='s'){e.preventDefault();$('pc-save').click()}})
  update()
  return { show(){requestAnimationFrame(draw)} }
})()
