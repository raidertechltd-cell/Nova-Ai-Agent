import { useEffect, useRef, useState, useCallback } from 'react'

type NovaState = 'idle' | 'listening' | 'thinking' | 'speaking'
type Overlay = null | 'analytics' | 'wallet' | 'backup'

let wakeWordPending = false

export default function Lounge(){
  const miniOrbRef=useRef<HTMLCanvasElement>(null)
  const waveRef=useRef<HTMLCanvasElement>(null)

  const [novaState,setNovaState]=useState<NovaState>('idle')
  const [overlay,setOverlay]=useState<Overlay>(null)
  const stateRef=useRef<NovaState>('idle')
  const audioRef=useRef<HTMLAudioElement|null>(null)
  const recognitionRef=useRef<any>(null)
  const restartTimeoutRef=useRef<number>(0)

  stateRef.current=novaState

  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)

  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    utterance.pitch = 1.0
    synthRef.current = utterance
    utterance.onstart = () => setNovaState('speaking')
    utterance.onend = () => {
      setNovaState('idle')
      synthRef.current = null
    }
    utterance.onerror = () => setNovaState('idle')
    window.speechSynthesis.speak(utterance)
  }, [])

  const pollAudioRef = useRef<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sendCommand = useCallback(async (text: string) => {
    setNovaState('thinking')
    try {
      const res = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data.intent) {
        const map: Record<string, Overlay> = { SHOW_WALLET: 'wallet', SHOW_ANALYTICS: 'analytics', SHOW_BACKUP: 'backup', HIDE_DASHBOARD: null }
        setOverlay(map[data.intent] ?? overlay)
      }
      // Speak text immediately via browser TTS
      if (data.reply) speakText(data.reply)
      // Poll for high-quality audio in background
      if (data.audioId) {
        const id = data.audioId
        const maxRetries = 30
        let tries = 0
        const poll = () => {
          pollAudioRef.current = window.setTimeout(async () => {
            tries++
            if (tries > maxRetries) return
            try {
              const statusRes = await fetch(`/api/audio-status/${id}`)
              const status = await statusRes.json()
              if (status.ready) {
                const audio = new Audio(`/api/audio/${id}.mp3`)
                audioRef.current = audio
                audio.onplay = () => {
                  window.speechSynthesis.cancel()
                  setNovaState('speaking')
                }
                audio.onended = () => {
                  setNovaState('idle')
                  audioRef.current = null
                }
                audio.play().catch(() => {})
              } else {
                poll()
              }
            } catch { poll() }
          }, 500)
        }
        poll()
      }
    } catch {
      setNovaState('idle')
    }
  }, [overlay, speakText])

  // ── Always-on SpeechRecognition ──
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    let recognition: any
    let stopped = false

    function startRec() {
      if (stopped) return
      try {
        recognition = new SpeechRecognition()
        recognitionRef.current = recognition
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (ev: any) => {
          if (stateRef.current === 'speaking' || stateRef.current === 'thinking') return
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const transcript = ev.results[i][0].transcript.trim().toLowerCase()
            const novaIdx = transcript.indexOf('nova')
            if (novaIdx !== -1) {
              const command = transcript.slice(novaIdx + 4).trim()
              if (command) {
                sendCommand(command)
              } else {
                wakeWordPending = true
              }
              return
            }
            if (wakeWordPending && transcript.length > 0) {
              wakeWordPending = false
              sendCommand(transcript)
              return
            }
          }
        }

        recognition.onerror = () => {
          if (!stopped) {
            restartTimeoutRef.current = window.setTimeout(startRec, 1000)
          }
        }

        recognition.onend = () => {
          if (!stopped) {
            restartTimeoutRef.current = window.setTimeout(startRec, 500)
          }
        }

        recognition.start()
      } catch {
        if (!stopped) {
          restartTimeoutRef.current = window.setTimeout(startRec, 1000)
        }
      }
    }

    startRec()

    return () => {
      stopped = true
      clearTimeout(restartTimeoutRef.current)
      try { if (recognition) recognition.abort() } catch {}
      recognitionRef.current = null
    }
  }, [sendCommand])

  // ── Clap detection via Web Audio API (Electron desktop) ──
  useEffect(() => {
    const desktop = (window as any).novaDesktop
    if (!desktop?.isDesktop) return

    let audioCtx: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let raf: number
    const CLAP_THRESHOLD = 0.3
    const CLAP_COOLDOWN = 2000
    let lastClap = 0
    const dataArray = new Uint8Array(128)

    async function startClapDetection() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioCtx = new AudioContext()
        source = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        function detect() {
          analyser!.getByteTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const val = dataArray[i] / 128 - 1
            sum += val * val
          }
          const rms = Math.sqrt(sum / dataArray.length)
          if (rms > CLAP_THRESHOLD && Date.now() - lastClap > CLAP_COOLDOWN) {
            lastClap = Date.now()
            desktop.sendWakeSignal()
          }
          raf = requestAnimationFrame(detect)
        }
        detect()
      } catch {}
    }

    startClapDetection()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (audioCtx) audioCtx.close()
    }
  }, [])

  // ── Mini Orb (lightning) ──
  useEffect(()=>{
    const canvas=miniOrbRef.current!
    const ctx=canvas.getContext('2d')!
    let raf:number
    let t=0

    function resize(){
      const dpr=window.devicePixelRatio||1
      const s=160
      canvas.style.width=s+'px'
      canvas.style.height=s+'px'
      canvas.width=s*dpr
      canvas.height=s*dpr
      ctx.setTransform(dpr,0,0,dpr,0,0)
    }
    resize()

    let bolts:{alpha:number;life:number;maxLife:number;points:{x:number;y:number}[]}[]
    function rebuildBolts(){
      const s=160,cx=s/2,cy=s/2,r=s*0.35
      bolts=[]
      for(let i=0;i<12;i++){
        const angle=(i/12)*Math.PI*2+Math.random()*0.3
        const targetDist=r*(0.7+Math.random()*0.4)
        const tx=cx+Math.cos(angle)*targetDist
        const ty=cy+Math.sin(angle)*targetDist
        const pts:{x:number;y:number}[]=[]
        const steps=5+Math.floor(Math.random()*3)
        for(let j=0;j<=steps;j++){
          const p=j/steps
          pts.push({x:cx+(tx-cx)*p+(Math.random()-0.5)*r*0.25,y:cy+(ty-cy)*p+(Math.random()-0.5)*r*0.25})
        }
        bolts.push({alpha:0.15+Math.random()*0.3,life:Math.random()*60,maxLife:30+Math.random()*30,points:pts})
      }
    }
    rebuildBolts()

    function draw(){
      t+=0.03
      const s=160,cx=s/2,cy=s/2,r=s*0.42
      ctx.clearRect(0,0,s,s)

      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.2)
      glow.addColorStop(0,'rgba(120,180,255,0.12)')
      glow.addColorStop(0.5,'rgba(255,100,180,0.06)')
      glow.addColorStop(1,'transparent')
      ctx.fillStyle=glow
      ctx.beginPath()
      ctx.arc(cx,cy,r*1.2,0,Math.PI*2)
      ctx.fill()

      for(const bolt of bolts){
        bolt.life+=0.5
        if(bolt.life>bolt.maxLife){
          const angle=Math.random()*Math.PI*2
          const targetDist=r*(0.7+Math.random()*0.4)
          const tx=cx+Math.cos(angle)*targetDist
          const ty=cy+Math.sin(angle)*targetDist
          const pts:{x:number;y:number}[]=[]
          const steps=5+Math.floor(Math.random()*3)
          for(let j=0;j<=steps;j++){
            const p=j/steps
            pts.push({x:cx+(tx-cx)*p+(Math.random()-0.5)*r*0.25,y:cy+(ty-cy)*p+(Math.random()-0.5)*r*0.25})
          }
          bolt.points=pts
          bolt.life=0
          bolt.alpha=0.15+Math.random()*0.25
        }
        const f=bolt.life<8?bolt.life/8:bolt.life>bolt.maxLife-8?(bolt.maxLife-bolt.life)/8:1
        ctx.beginPath()
        ctx.moveTo(bolt.points[0].x,bolt.points[0].y)
        for(let j=1;j<bolt.points.length;j++)ctx.lineTo(bolt.points[j].x,bolt.points[j].y)
        ctx.strokeStyle='rgba(100,200,255,0.4)'
        ctx.lineWidth=1
        ctx.globalAlpha=Math.min(bolt.alpha*f,0.4)
        ctx.stroke()
        ctx.strokeStyle='rgba(255,100,200,0.08)'
        ctx.lineWidth=3
        ctx.stroke()
        ctx.globalAlpha=1
      }
      raf=requestAnimationFrame(draw)
    }
    draw()
    return ()=>{cancelAnimationFrame(raf)}
  },[])

  // ── Rainbow Waveform ──
  useEffect(()=>{
    const canvas=waveRef.current!
    const ctx=canvas.getContext('2d')!
    let raf:number
    let t=0

    function resize(){
      const dpr=window.devicePixelRatio||1
      canvas.width=canvas.clientWidth*dpr
      canvas.height=canvas.clientHeight*dpr
      ctx.setTransform(dpr,0,0,dpr,0,0)
    }
    resize()
    window.addEventListener('resize',resize)

    function draw(){
      t+=0.025
      const w=canvas.clientWidth,h=canvas.clientHeight
      ctx.clearRect(0,0,w,h)

      const st=stateRef.current
      const baseY=h*0.6
      const energy=st==='speaking'?0.3:0
      const isActive=st==='thinking'||st==='speaking'
      const amp=isActive?22*(1+energy*1.5):8

      const layers=7
      for(let l=0;l<layers;l++){
        const la=amp*(0.4+l*0.25)
        const hueShift=t*40+l*20+energy*60
        const waveSpeed=0.4+l*0.15

        ctx.beginPath()
        for(let x=0;x<=w;x+=1){
          let y=0
          y+=Math.sin(x*0.02+t*waveSpeed)*la
          y+=Math.sin(x*0.04+t*waveSpeed*0.7+l)*la*0.35
          y+=Math.sin(x*0.009+t*0.2+l*0.4)*la*0.2
          if(energy>0.01){
            y+=Math.sin(x*0.06+t+energy*4)*la*energy*0.5
          }
          const px=x,py=baseY+y*0.08
          x===0?ctx.moveTo(px,py):ctx.lineTo(px,py)
        }
        ctx.strokeStyle=`hsla(${(hueShift)%360},85%,${55+l*4}%,${0.06+l*0.035})`
        ctx.lineWidth=1.2+l*0.7
        ctx.stroke()
      }

      for(let l=0;l<4;l++){
        const la=amp*(0.3+l*0.18)*0.5
        const hueShift=t*40+l*40+energy*60

        ctx.beginPath()
        for(let x=0;x<=w;x+=2){
          let y=0
          y+=Math.sin(x*0.02+t*(0.4+l*0.15))*la
          y+=Math.sin(x*0.04+t*0.3+l)*la*0.35
          const px=x,py=baseY+40-y*0.08
          x===0?ctx.moveTo(px,py):ctx.lineTo(px,py)
        }
        ctx.strokeStyle=`hsla(${(hueShift+180)%360},80%,55%,${0.03+l*0.02})`
        ctx.lineWidth=0.8+l*0.4
        ctx.stroke()
      }

      raf=requestAnimationFrame(draw)
    }
    draw()
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize)}
  },[])

  const handleInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const el = inputRef.current
    const val = el?.value?.trim()
    if (val && el) {
      sendCommand(val)
      el.value = ''
    }
  }, [sendCommand])

  return (
    <div>
      <div className="rainbow-bg" />
      <div className={`orb-container ${novaState}`}>
        <div className="orb-ring" />
        <canvas ref={miniOrbRef} />
      </div>
      <canvas id="wave-canvas" ref={waveRef} />
      <div className={`glass-overlay ${overlay?'active':''}`}>
        <div className="backdrop" onClick={()=>setOverlay(null)} />
        <div className="panel">
          <button className="close-btn" onClick={()=>setOverlay(null)}>✕</button>
        </div>
      </div>
      <form className="text-input-bar" onSubmit={handleInputSubmit}>
        <input ref={inputRef} type="text" placeholder='Say "Nova" or type a command...' />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
