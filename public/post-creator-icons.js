// Web canvas equivalents of the Post Creator instrument badges.
window.PostCreatorIcons = (() => {
  const entries = [
    ['NQ1!','100','#009BB8'], ['ES1!','500','#C81039'], ['YM1!','30','#15A7CD'], ['RTY1!','2000','#560B30'],
    ['SI1!','metal','#A9A7B6'], ['GC1!','metal','#D4A000'], ['PL1!','metal','#B9B4AA'],
    ['HO1!','fuel','#191C20'], ['CL1!','drop','#17191D'], ['RB1!','fuel','#FF7026'],
    ['BTC1!','bitcoin','#FF9510'], ['ETH1!','ether','#53629B'], ['TOTAL3','total','#326AFF'],
    ['6E1!','eu','#0871C6'], ['6B1!','uk','#1262AE'], ['DXY','dollar','#009785'],
    ['EURUSD','eurusd','#0871C6'], ['GBPUSD','gbpusd','#1262AE'],
    ['XAUUSD','metal','#D4A000'], ['XAUEUR','metal','#D4A000'], ['XAUGBP','metal','#D4A000'],
    ['XAGUSD','metal','#A9A7B6'], ['XAGEUR','metal','#A9A7B6'], ['XAGGBP','metal','#A9A7B6'],
    ['BTCUSD','bitcoin','#FF9510'], ['ETHUSD','ether','#53629B'],
    ['US100','100','#009BB8'], ['US500','500','#C81039'], ['US30','30','#15A7CD'], ['US2000','2000','#560B30'],
    ['XYZ100','100','#009BB8'], ['SP500','500','#C81039'],
  ]
  const byTicker = new Map(entries.map(([ticker,kind,color]) => [ticker,{kind,color}]))
  const color = ticker => byTicker.get(ticker)?.color || '#394f79'
  function line(c,x1,y1,x2,y2,width,stroke='#fff') { c.strokeStyle=stroke;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke() }
  function poly(c,points,fill) { c.fillStyle=fill;c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.closePath();c.fill() }
  function text(c,s,x,y,fraction,size) { c.save();c.scale(1/size,1/size);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${fraction*size}px Arial, sans-serif`;c.fillText(s,x*size,y*size);c.restore() }
  function flag(c,kind,x,y,s) {
    c.save();c.beginPath();c.arc(x+s/2,y+s/2,s/2,0,Math.PI*2);c.clip()
    if(kind==='us'){
      c.fillStyle='#fff';c.fillRect(x,y,s,s);c.fillStyle='#E94F5A';for(let i=0;i<7;i++)c.fillRect(x,y+i*s/7,s,s/14)
      c.fillStyle='#1462AB';c.fillRect(x,y,s*.53,s*.53);c.fillStyle='#fff';for(let iy=0;iy<3;iy++)for(let ix=0;ix<3;ix++){c.beginPath();c.arc(x+s*(.1+ix*.15),y+s*(.1+iy*.15),s*.017,0,Math.PI*2);c.fill()}
    }else if(kind==='uk'){
      c.fillStyle='#1262AE';c.fillRect(x,y,s,s)
      line(c,x,y,x+s,y+s,s*.18);line(c,x+s,y,x,y+s,s*.18)
      line(c,x,y,x+s,y+s,s*.07,'#ED334D');line(c,x+s,y,x,y+s,s*.07,'#ED334D')
      line(c,x+s/2,y,x+s/2,y+s,s*.28);line(c,x,y+s/2,x+s,y+s/2,s*.28)
      line(c,x+s/2,y,x+s/2,y+s,s*.15,'#ED334D');line(c,x,y+s/2,x+s,y+s/2,s*.15,'#ED334D')
    }else{
      c.fillStyle='#0871C6';c.fillRect(x,y,s,s)
      for(let i=0;i<12;i++){const a=i*Math.PI/6; c.fillStyle='#FFD449';c.beginPath();c.arc(x+s*(.5+Math.cos(a)*.33),y+s*(.5+Math.sin(a)*.33),s*.03,0,Math.PI*2);c.fill()}
    }
    c.restore()
  }
  function draw(c,ticker,x,y,size) {
    const {kind,color:fill}=byTicker.get(ticker)||{kind:'dollar',color:'#394f79'}
    c.save();c.translate(x,y);c.scale(size,size)
    c.fillStyle=fill;c.beginPath();c.arc(.5,.5,.5,0,Math.PI*2);c.fill()
    if(['100','500','30','2000'].includes(kind)) text(c,kind,.5,.53,kind==='2000'?.29:.4,size)
    else if(kind==='eu'||kind==='uk')flag(c,kind,0,0,1)
    else if(kind==='eurusd'||kind==='gbpusd'){flag(c,'us',.32,-.06,.75);flag(c,kind==='eurusd'?'eu':'uk',-.04,.26,.75)}
    else if(kind==='bitcoin')text(c,'₿',.5,.52,.8,size)
    else if(kind==='dollar')text(c,'$',.5,.52,.8,size)
    else if(kind==='metal'){
      for(const [px,py] of [[.39,.28],[.17,.55],[.58,.55]]){
        c.strokeStyle='#fff';c.lineWidth=.033;c.beginPath();c.moveTo(px,py);c.lineTo(px+.19,py);c.lineTo(px+.27,py+.18);c.lineTo(px-.07,py+.18);c.closePath();c.stroke()
        line(c,px,py+.07,px+.22,py+.07,.025)
      }
    }else if(kind==='ether'){
      poly(c,[[.5,.1],[.22,.51],[.5,.65]],'#DAE3FF');poly(c,[[.5,.1],[.78,.51],[.5,.65]],'#A8B8EC')
      poly(c,[[.22,.56],[.5,.9],[.5,.7]],'#fff');poly(c,[[.78,.56],[.5,.9],[.5,.7]],'#9BADDE')
    }else if(kind==='drop'){
      c.fillStyle='#fff';c.beginPath();c.moveTo(.5,.2);c.bezierCurveTo(.99,.79,.71,.82,.5,.82);c.bezierCurveTo(.12,.84,.22,.62,.5,.2);c.fill()
    }else if(kind==='fuel'){
      c.strokeStyle='#fff';c.lineWidth=.05;c.strokeRect(.32,.25,.37,.54)
      line(c,.4,.2,.62,.2,.06);line(c,.32,.31,.69,.74,.032);line(c,.69,.31,.32,.74,.032)
    }else if(kind==='total'){
      for(let i=0;i<3;i++){c.strokeStyle='#fff';c.lineWidth=.025;c.beginPath();c.ellipse(.46+i*.07,.32+i*.18,.25,.10,0,0,Math.PI*2);c.stroke();line(c,.71+i*.07,.32+i*.18,.85+i*.07,.32+i*.18,.025)}
    }
    c.restore()
  }
  const thumbnails=new Map()
  function image(ticker){
    if(!thumbnails.has(ticker)){const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;draw(canvas.getContext('2d'),ticker,0,0,80);thumbnails.set(ticker,canvas.toDataURL('image/png'))}
    return thumbnails.get(ticker)
  }
  return {entries,draw,image,color}
})()
