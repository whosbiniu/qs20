window.PostCreator = (() => {
  const root = document.getElementById('post-creator')
  const tickers = ['NQ1!','ES1!','YM1!','RTY1!','SI1!','GC1!','PL1!','HO1!','CL1!','RB1!','BTC1!','ETH1!','TOTAL3','6E1!','6B1!','DXY','EURUSD','GBPUSD','XAUUSD','XAUEUR','XAUGBP','XAGUSD','XAGEUR','XAGGBP','BTCUSD','ETHUSD','US100','US500','US30','US2000','XYZ100','SP500']
  const initial = () => ({ version: 2, activePanel: 'charts', ticker: 'NQ1!', timeframe: 'H1', canvasWidth: 4096, canvasHeight: 2840, background: null, charts: [], showBadge: true, showHeader: true, showLines: true, badgeX: .077, badgeY: .47, badgeScale: 1, displayName: 'biniu.B3', handle: '@biniub3', avatar: null, aura: { textColor: '#fff', ticker: 'NQ1!', ticks: '663', rr: '8.3', date: new Date().toISOString().slice(0,10), photo: null, width: 2160, height: 2880, zoom: 1, positionX: .5, positionY: .5, dim: 0, footerShade: .16, footerMargin: .025, showBrand: true, showRR: true, showTicks: true, showDate: true, showIcon: true } })
  let project = initial(), selected = -1, images = new Map(), drag = null
  try { const saved = JSON.parse(localStorage.getItem('postcreator-project') || 'null'); if (saved?.version === 2) project = { ...initial(), ...saved, aura: { ...initial().aura, ...saved.aura } } } catch {}
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
  const $ = id => document.getElementById(id)
  root.innerHTML = `<div class="pc"><aside class="pc-controls"><h3>POST CREATOR</h3><div class="pc-tabs"><button data-mode="charts">Wykresy</button><button data-mode="aura">Aura</button></div><div id="pc-fields"></div></aside><div class="pc-stage"><div class="pc-top"><span id="pc-mode-title">Wykresy</span><div class="pc-spacer"></div><button id="pc-open">Otwórz projekt</button><button id="pc-save">Zapisz projekt</button><button id="pc-export">Eksportuj PNG</button><button id="pc-copy">Kopiuj PNG</button></div><div class="pc-preview" id="pc-drop"><canvas id="pc-canvas" aria-label="Podgląd grafiki"></canvas></div><div class="pc-status" id="pc-status">Wklej obraz (⌘V), przeciągnij plik lub wybierz go w panelu.</div></div><input type="file" id="pc-file" accept="image/*" hidden><input type="file" id="pc-project-file" accept=".postcreator,application/json" hidden></div>`
  const canvas = $('pc-canvas'), ctx = canvas.getContext('2d')
  const status = s => $('pc-status').textContent = s
  const check = (name, label, value) => `<label class="pc-check"><input type="checkbox" data-field="${name}" ${value ? 'checked' : ''}>${label}</label>`
  const field = (name, label, value, type='text', extra='') => `<label>${label}<input data-field="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}></label>`
  const select = (name, label, value, options) => `<label>${label}<select data-field="${name}">${options.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`
  const quickSelect = (mode, value) => `<div class="pc-quick-title">Quick Select</div><div class="pc-quick" role="group" aria-label="Wybierz ticker">${tickers.map(ticker => `<button type="button" data-ticker="${ticker}" data-for="${mode}" class="${ticker === value ? 'active' : ''}" aria-label="Wybierz ${ticker}" aria-pressed="${ticker === value}"><img src="${PostCreatorIcons.image(ticker)}" alt=""><span>${ticker}</span></button>`).join('')}</div>`
  function controls() {
    const a = project.aura, mode = project.activePanel
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode))
    $('pc-mode-title').textContent = mode === 'aura' ? 'Aura · zdjęcie wyniku' : 'Wykresy · grafika tradingowa'
    const common = `<fieldset><legend>Profil</legend>${field('displayName','Nazwa profilu',project.displayName)}${field('handle','Handle',project.handle)}<button data-action="avatar">Wybierz avatar</button></fieldset>`
    const chart = `<fieldset><legend>Instrument</legend>${select('ticker','Ticker',project.ticker,tickers.map(x => [x,x]))}${field('timeframe','Interwał',project.timeframe)}${select('format','Format',`${project.canvasWidth}x${project.canvasHeight}`,[['4096x2840','Poziomy 4096 × 2840'],['3000x3000','Kwadrat 3000 × 3000'],['2400x3000','Pion 4:5'],['2160x3840','Story 9:16']])}${quickSelect('charts',project.ticker)}</fieldset>
      <fieldset><legend>Obrazy</legend><div class="pc-actions"><button data-action="chart">Dodaj wykres</button><button data-action="background">Podkład</button></div><div class="pc-layers">${project.charts.map((c,i) => `<button data-layer="${i}" class="${selected === i ? 'active' : ''}">${i+1}. ${esc(c.name || 'Wykres')}</button>`).join('')}</div>${selected >= 0 ? `<div class="pc-actions"><button data-action="up">Wyżej</button><button data-action="down">Niżej</button><button data-action="remove">Usuń</button></div>${select('fit','Dopasowanie',project.charts[selected]?.fit || 'fit',[['fit','Cały obraz'],['fill','Wypełnij ramkę']])}${field('opacity','Przezroczystość',project.charts[selected]?.opacity ?? 1,'range','min="0" max="1" step="0.05"')}` : ''}</fieldset>
      <fieldset><legend>Elementy</legend>${check('showHeader','Nagłówek',project.showHeader)}${check('showLines','Linie nagłówka',project.showLines)}${check('showBadge','Etykieta tickeru',project.showBadge)}${field('badgeScale','Skala etykiety',project.badgeScale,'range','min="0.5" max="2" step="0.05"')}</fieldset>`
    const aura = `<fieldset><legend>Wynik</legend>${select('aura.textColor','Kolor napisów',a.textColor,[['#fff','Biały'],['#000','Czarny']])}${select('aura.ticker','Ticker',a.ticker,tickers.map(x => [x,x]))}<div class="pc-row">${field('aura.ticks','Ticki',a.ticks)}${field('aura.rr','Wynik w R',a.rr)}</div>${field('aura.date','Data',a.date,'date')}${select('aura.format','Format',`${a.width}x${a.height}`,[['2160x2880','3:4 · 2160 × 2880'],['2160x2700','4:5 · 2160 × 2700'],['2160x3840','9:16 · 2160 × 3840'],['2160x2160','Kwadrat · 2160 × 2160']])}${quickSelect('aura',a.ticker)}</fieldset>
      <fieldset><legend>Zdjęcie</legend><button data-action="photo">Dodaj zdjęcie</button>${field('aura.zoom','Powiększenie',a.zoom,'range','min="1" max="4" step="0.05"')}${field('aura.dim','Przyciemnienie',a.dim,'range','min="0" max="1" step="0.05"')}${field('aura.footerShade','Cień pod wynikiem',a.footerShade,'range','min="0" max="1" step="0.05"')}${field('aura.footerMargin','Odstęp od dołu',a.footerMargin,'range','min="0" max="0.3" step="0.005"')}</fieldset>
      <fieldset><legend>Widoczność</legend>${check('aura.showBrand','Profil',a.showBrand)}${check('aura.showRR','Wynik R',a.showRR)}${check('aura.showTicks','Ticki',a.showTicks)}${check('aura.showDate','Data',a.showDate)}${check('aura.showIcon','Ikona',a.showIcon)}</fieldset>`
    $('pc-fields').innerHTML = (mode === 'aura' ? aura : chart) + common
  }
  function getImage(data) {
    if (!data) return null
    if (!images.has(data)) { const img = new Image(); img.onload = draw; img.src = data.startsWith('data:') || data.startsWith('/') ? data : 'data:image/png;base64,' + data; images.set(data, img) }
    const img = images.get(data); return img.complete && img.naturalWidth ? img : null
  }
  function placeImage(c, img, x, y, w, h, fit='fit', opacity=1) {
    if (!img) return
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip(); c.globalAlpha = opacity
    const scale = fit === 'fill' ? Math.max(w/img.width,h/img.height) : Math.min(w/img.width,h/img.height)
    const iw = img.width*scale, ih=img.height*scale
    c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih); c.restore()
  }
  function badge(c,ticker,x,y,size) {
    PostCreatorIcons.draw(c,ticker,x,y,size)
  }
  function render(c,w,h,preview=false) {
    c.clearRect(0,0,w,h); c.save()
    if (project.activePanel === 'aura') {
      const a=project.aura; c.fillStyle='#202330';c.fillRect(0,0,w,h)
      const photo=getImage(a.photo)
      if (photo) { const scale=Math.max(w/photo.width,h/photo.height)*Number(a.zoom); const pw=photo.width*scale,ph=photo.height*scale; placeImage(c,photo,-(pw-w)*Number(a.positionX),-(ph-h)*Number(a.positionY),pw,ph,'fill') }
      c.fillStyle=`rgba(0,0,0,${a.dim})`;c.fillRect(0,0,w,h)
      const s=w/416, top=h-h*Number(a.footerMargin)-75*s
      const grad=c.createLinearGradient(0,top-80*s,0,h);grad.addColorStop(0,'transparent');grad.addColorStop(1,`rgba(0,0,0,${a.footerShade})`);c.fillStyle=grad;c.fillRect(0,top-80*s,w,h-top+80*s)
      c.fillStyle=a.textColor === '#000' ? '#000' : '#fff';c.textAlign='left';c.textBaseline='alphabetic'
      if (a.showBrand) { const av=getImage(project.avatar || '/postcreator-avatar.jpg'); if (av) {c.save();c.beginPath();c.arc(44*s,58*s,30*s,0,Math.PI*2);c.clip();placeImage(c,av,14*s,28*s,60*s,60*s,'fill');c.restore()} c.font=`bold ${14*s}px Arial`;c.fillText(project.displayName,14*s,111*s);c.font=`${12*s}px Arial`;c.fillText(project.handle,14*s,130*s) }
      const signed=v=>!v ? '' : /^[+\-−]/.test(String(v)) ? String(v) : '+'+v
      c.font=`bold ${21*s}px Arial`;if(a.showRR)c.fillText(signed(a.rr)+'R',10*s,top+27*s);if(a.showTicks)c.fillText(signed(a.ticks)+' Ticks',10*s,top+55*s)
      c.textAlign='center';c.font=`bold ${24*s}px Arial`;c.fillText(a.ticker,w*.54,top+28*s)
      if(a.showDate){const d=a.date?.split('-');c.font=`${15*s}px Arial`;c.fillText(d?.length===3?`${d[2]}/${d[1]}/${d[0]}`:'',w*.54,top+52*s)}
      if(a.showIcon)badge(c,a.ticker,w-69*s,top+2*s,53*s)
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
  function draw() { const a=project.aura;const ratio=project.activePanel==='aura'?a.height/a.width:project.canvasHeight/project.canvasWidth;canvas.width=1000;canvas.height=Math.round(1000*ratio);render(ctx,canvas.width,canvas.height,true) }
  function saveLocal(){try{localStorage.setItem('postcreator-project',JSON.stringify(project))}catch{status('Projekt jest zbyt duży dla autozapisu. Użyj „Zapisz projekt”.')}}
  function update(){controls();draw();saveLocal()}
  function fileData(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
  let fileTarget='chart'
  async function addFile(file,target=fileTarget){
    if(!file)return
    try {
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
      }else if(target==='photo')project.aura.photo=data
      else if(target==='background'){project.background=data;project.showHeader=false}
      else{
        if(project.charts.length>=8){status('Maksymalnie 8 wykresów.');return}
        project.charts.push({name:file.name||'Wykres',data,x:.3,y:.18,width:.54,height:.68,fit:'fit',opacity:1});selected=project.charts.length-1
      }
      status(target==='avatar'?'Wczytano avatar.':target==='chart'?'Dodano wykres. Przeciągnij go na podglądzie, aby ustawić pozycję.':'Dodano obraz.')
      update()
    }catch(error){status('Nie udało się wczytać obrazu: '+error.message)}
  }
  root.addEventListener('click',e=>{const mode=e.target.closest('[data-mode]')?.dataset.mode;if(mode){project.activePanel=mode;selected=-1;update();return}const chosen=e.target.closest('[data-ticker]');if(chosen){if(chosen.dataset.for==='aura')project.aura.ticker=chosen.dataset.ticker;else project.ticker=chosen.dataset.ticker;update();return}const layer=e.target.closest('[data-layer]')?.dataset.layer;if(layer!==undefined){selected=Number(layer);update();return}const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;if(['chart','photo','background','avatar'].includes(action)){fileTarget=action;$('pc-file').click();return}if(selected<0)return;if(action==='remove'){project.charts.splice(selected,1);selected=-1}else if(action==='up'&&selected<project.charts.length-1){[project.charts[selected],project.charts[selected+1]]=[project.charts[selected+1],project.charts[selected]];selected++}else if(action==='down'&&selected>0){[project.charts[selected],project.charts[selected-1]]=[project.charts[selected-1],project.charts[selected]];selected--}update()})
  root.addEventListener('input',e=>{const key=e.target.dataset.field;if(!key)return;let value=e.target.type==='checkbox'?e.target.checked:e.target.value;if(e.target.type==='range')value=Number(value);if(key==='format'){[project.canvasWidth,project.canvasHeight]=value.split('x').map(Number)}else if(key==='aura.format'){[project.aura.width,project.aura.height]=value.split('x').map(Number)}else if(['fit','opacity'].includes(key)){if(project.charts[selected])project.charts[selected][key]=value}else if(key.startsWith('aura.'))project.aura[key.slice(5)]=value;else project[key]=value;if(key==='ticker'||key==='aura.ticker')controls();draw();saveLocal()})
  $('pc-file').onchange=e=>{addFile(e.target.files[0]);e.target.value=''}
  $('pc-open').onclick=()=>$('pc-project-file').click()
  $('pc-project-file').onchange=async e=>{try{const incoming=JSON.parse(await e.target.files[0].text());if(!incoming||!Array.isArray(incoming.charts))throw Error('Nieprawidłowy plik');project={...initial(),...incoming,aura:{...initial().aura,...incoming.aura}};selected=-1;images.clear();update();status('Otworzono projekt.')}catch(err){status(err.message)}e.target.value=''}
  const asBase64 = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)})
  async function download(blob,name){
    if(window.webkit?.messageHandlers?.postCreatorFile){
      const result=await window.webkit.messageHandlers.postCreatorFile.postMessage({action:'save',filename:name,data:await asBase64(blob)})
      return !result.cancelled
    }
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    return true
  }
  $('pc-save').onclick=async()=>{try{if(await download(new Blob([JSON.stringify(project)],{type:'application/json'}),`${project.ticker||'PostCreator'}.postcreator`))status('Zapisano projekt.')}catch(error){status('Nie udało się zapisać projektu: '+error.message)}}
  async function exportBlob(){const out=document.createElement('canvas'),a=project.aura;out.width=project.activePanel==='aura'?a.width:project.canvasWidth;out.height=project.activePanel==='aura'?a.height:project.canvasHeight;render(out.getContext('2d'),out.width,out.height);return new Promise(resolve=>out.toBlob(resolve,'image/png'))}
  $('pc-export').onclick=async()=>{try{const blob=await exportBlob();if(blob&&await download(blob,`PostCreator-${project.activePanel}-${Date.now()}.png`))status(`Wyeksportowano ${project.activePanel==='aura'?project.aura.width:project.canvasWidth} × ${project.activePanel==='aura'?project.aura.height:project.canvasHeight} PNG.`)}catch(error){status('Nie udało się wyeksportować PNG: '+error.message)}}
  $('pc-copy').onclick=async()=>{try{const blob=await exportBlob();if(window.webkit?.messageHandlers?.postCreatorFile)await window.webkit.messageHandlers.postCreatorFile.postMessage({action:'copy',data:await asBase64(blob)});else await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);status('Skopiowano PNG.')}catch{status('Kopiowanie obrazu jest niedostępne. Użyj eksportu PNG.')}}
  const drop=$('pc-drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('pc-drop')});drop.addEventListener('dragleave',()=>drop.classList.remove('pc-drop'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('pc-drop');addFile(e.dataTransfer.files[0],project.activePanel==='aura'?'photo':'chart')})
  root.addEventListener('paste',e=>{const file=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();addFile(file,project.activePanel==='aura'?'photo':'chart')}})
  canvas.addEventListener('pointerdown',e=>{
    if(project.activePanel!=='charts'||e.button!==0)return
    const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height
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
