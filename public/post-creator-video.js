/* Local MP4 playback and export for Aura. No camera, microphone or upload. */
window.PostCreatorVideo = class {
  constructor({draw,status,changed,busy}) {
    Object.assign(this,{draw,status,changed,busy})
    this.video=document.createElement('video');this.video.playsInline=true;this.video.preload='auto'
    this.video.setAttribute('aria-hidden','true');this.video.style.display='none';document.getElementById('post-creator').append(this.video)
    this.video.addEventListener('play',()=>this.animate())
    for(const event of ['pause','seeked','ended','loadeddata'])this.video.addEventListener(event,()=>{this.draw();this.sync()})
    this.video.addEventListener('timeupdate',()=>this.sync())
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.cancel?.(new Error('Eksport przerwany po ukryciu okna. Pozostaw okno widoczne do zakończenia eksportu.'));this.video.pause()}})
    new MutationObserver(()=>{if(document.getElementById('post-creator').hidden){this.cancel?.(new Error('Eksport przerwany po opuszczeniu Post Creatora. Pozostaw edytor otwarty do zakończenia eksportu.'));this.video.pause()}}).observe(document.getElementById('post-creator'),{attributes:true,attributeFilter:['hidden']})
    this.frame=0;this.generation=0;this.exporting=false
  }
  get ready(){return !!this.url && this.video.readyState>=2}
  async load(file){
    if(this.exporting)return
    if(file.type!=='video/mp4'&&!/\.mp4$/i.test(file.name))throw Error('Wybierz film MP4.')
    this.clear();const token=this.generation;this.url=URL.createObjectURL(file)
    try {
      await new Promise((resolve,reject)=>{
        const clean=()=>{clearTimeout(timer);this.video.removeEventListener('loadeddata',ok);this.video.removeEventListener('error',fail)}
        const ok=()=>{clean();resolve()};const fail=()=>{clean();reject(Error('Nie można odczytać MP4. Użyj filmu H.264 lub HEVC obsługiwanego przez tę przeglądarkę.'))}
        const timer=setTimeout(fail,20000);this.video.addEventListener('loadeddata',ok);this.video.addEventListener('error',fail)
        this.video.src=this.url;this.video.load()
      })
      if(token!==this.generation)return false
      if(!Number.isFinite(this.video.duration)||this.video.duration<=0)throw Error('Film nie ma prawidłowej długości.')
      this.changed(file.name);return true
    } catch(error){if(token===this.generation){this.clear();this.changed(null)}throw error}
  }
  clear(){
    this.generation++;this.video.pause();cancelAnimationFrame(this.frame);this.video.removeAttribute('src');this.video.load()
    if(this.url)URL.revokeObjectURL(this.url);this.url=null
  }
  animate(){
    cancelAnimationFrame(this.frame)
    const tick=()=>{if(!this.video.paused&&!this.video.ended){this.draw();this.sync();this.frame=requestAnimationFrame(tick)}}
    this.frame=requestAnimationFrame(tick)
  }
  sync(){
    const seek=document.getElementById('pc-video-seek'),play=document.getElementById('pc-video-play'),time=document.getElementById('pc-video-time')
    if(seek){seek.max=Number.isFinite(this.video.duration)?this.video.duration:0;seek.value=this.video.currentTime||0}
    if(play)play.textContent=this.video.paused?'Odtwórz':'Pauza'
    const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`
    if(time)time.textContent=`${format(this.video.currentTime||0)} / ${format(Number.isFinite(this.video.duration)?this.video.duration:0)}`
  }
  async toggle(){if(!this.ready||this.exporting)return;if(this.video.paused){if(this.video.ended)this.video.currentTime=0;await this.audioContext?.resume();await this.video.play()}else this.video.pause()}
  seek(value){if(this.ready&&!this.exporting)this.video.currentTime=Number(value)}
  async at(time){if(Math.abs(this.video.currentTime-time)<.001)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(Error('Nie można przewinąć filmu.'))},10000);const clean=()=>{clearTimeout(timer);this.video.removeEventListener('seeked',done)};const done=()=>{clean();resolve()};this.video.addEventListener('seeked',done);this.video.currentTime=time})}
  // Encoder plans, best first. MediaRecorder.isTypeSupported only checks the container, so each H.264 profile and
  // size is also checked with WebCodecs where available: hardware encoders often refuse High profile, and Baseline
  // 3.1 cannot encode more than ~720p ("The given encoder configuration is not supported by the encoder").
  async plans(width,height){
    const sizes=[[width,height]]
    if(width>720)sizes.push([720,Math.round(height*720/width/2)*2])
    const codecs=['avc1.640033','avc1.4d0033','avc1.42e033','avc1.640028','avc1.4d0028','avc1.42e02a','avc1.42e01f']
    const plans=[]
    for(const [w,h] of sizes){
      const bitrate=Math.round(12000000*w/1080)
      for(const codec of codecs){
        const mime=`video/mp4;codecs=${codec},mp4a.40.2`
        if(!window.MediaRecorder?.isTypeSupported(mime))continue
        if(window.VideoEncoder?.isConfigSupported){
          try{if(!(await VideoEncoder.isConfigSupported({codec,width:w,height:h,bitrate,framerate:30})).supported)continue}catch{continue}
        }
        plans.push({mime,width:w,height:h,bitrate})
      }
      if(window.MediaRecorder?.isTypeSupported('video/mp4'))plans.push({mime:'video/mp4',width:w,height:h,bitrate})
    }
    return plans
  }
  async export({width,height,render}){
    if(this.exporting)throw Error('Eksport już trwa.')
    if(!this.ready)throw Error('Wybierz ponownie źródłowy MP4.')
    const plans=await this.plans(width,height)
    if(!plans.length)throw Error('Ta przeglądarka nie koduje MP4. Otwórz Aurę w Safari, aktualnym Chrome lub aplikacji UNCsWay.')
    if(!document.createElement('canvas').captureStream)throw Error('Eksport wideo jest niedostępny w tej przeglądarce.')
    const video=this.video,previousTime=video.currentTime,wasMuted=video.muted
    this.exporting=true;this.busy(true);video.pause()
    try {
      let last
      for(const plan of plans){
        try{const blob=await this.record(plan,render);blob.exportSize=[plan.width,plan.height];return blob}
        catch(error){
          last=error
          // Only a refused configuration (before anything was encoded) moves on to the next plan.
          if(error?.recorded||!(error?.name==='NotSupportedError'||/not supported|encoder/i.test(error?.message||'')))throw error
        }
      }
      throw last
    } finally {
      this.audioSource?.disconnect();if(this.audioContext)this.audioSource?.connect(this.audioContext.destination)
      video.muted=wasMuted
      try{await this.at(previousTime)}catch{}
      this.exporting=false;this.busy(false);this.draw();this.sync()
    }
  }
  async record({mime,width,height,bitrate},render){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
    const c=canvas.getContext('2d'),video=this.video
    let stream,recorder,raf=0,timeout,progress,complete=false,bytes=0
    try {
      const Audio=window.AudioContext||window.webkitAudioContext
      if(!this.audioContext){this.audioContext=new Audio();this.audioSource=this.audioContext.createMediaElementSource(video)}
      await this.audioContext.resume();this.audioSource.disconnect()
      const sound=this.audioContext.createMediaStreamDestination();this.audioSource.connect(sound);video.muted=false
      await this.at(0)
      render(c,width,height);stream=canvas.captureStream(30)
      sound.stream.getAudioTracks().forEach(track=>stream.addTrack(track))
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:192000})
      const chunks=[]
      const result=new Promise((resolve,reject)=>{
        let failure=null
        const fail=error=>{if(error&&typeof error==='object')error.recorded=bytes>0;return error}
        this.cancel=(error=new DOMException('Anulowano eksport MP4.','AbortError'))=>{if(complete)return;failure=fail(error);video.pause();if(recorder.state!=='inactive')recorder.stop();else reject(failure)}
        recorder.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>512*1024*1024)this.cancel?.(Error('Film przekracza 512 MB. Użyj krótszego materiału.'))}}
        recorder.onerror=e=>{failure=fail(e.error||Error('Błąd kodera MP4.'));this.cancel?.(failure)}
        recorder.onstop=()=>{complete=true;failure?reject(failure):bytes?resolve(new Blob(chunks,{type:'video/mp4'})):reject(Error('Koder nie zwrócił filmu.'))}
        video.onended=()=>{render(c,width,height);if(recorder.state!=='inactive')recorder.stop()}
        video.onerror=()=>this.cancel?.(Error('Nie można odczytać filmu podczas eksportu.'))
      })
      // Attach a handler immediately, including while play() is pending.
      result.catch(()=>{})
      const tick=()=>{render(c,width,height);raf=requestAnimationFrame(tick)}
      tick();recorder.start(1000)
      progress=setInterval(()=>this.status(`Eksport MP4 · ${Math.min(99,Math.floor(video.currentTime/video.duration*100))}% · pozostaw okno widoczne`),250)
      timeout=setTimeout(()=>this.cancel?.(Error('Przerwano eksport: film zatrzymał się podczas odtwarzania.')),video.duration*1500+30000)
      try{await video.play()}catch(error){this.cancel?.(error)}
      return await result
    } finally {
      complete=true;this.cancel=null;clearInterval(progress);clearTimeout(timeout);cancelAnimationFrame(raf)
      video.onended=null;video.onerror=null;video.pause()
      if(recorder&&recorder.state!=='inactive')recorder.stop()
      stream?.getTracks().forEach(track=>track.stop())
    }
  }
}
