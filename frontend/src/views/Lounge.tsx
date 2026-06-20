import { useEffect, useRef, useState, useCallback } from 'react'

type NovaState = 'idle' | 'listening' | 'thinking' | 'speaking'
type WidgetData = { type: string; title: string; data: any }

export default function Lounge(){
  const miniOrbRef=useRef<HTMLCanvasElement>(null)
  const waveRef=useRef<HTMLCanvasElement>(null)

  const [novaState,setNovaState]=useState<NovaState>('idle')
  const [overlay,setOverlay]=useState<boolean>(false)
  const [widgetData,setWidgetData]=useState<WidgetData|null>(null)
  const stateRef=useRef<NovaState>('idle')
  const audioRef=useRef<HTMLAudioElement|null>(null)
  const recognitionRef=useRef<any>(null)
  const restartTimeoutRef=useRef<number>(0)
  const startRecRef = useRef<(() => void) | null>(null)

  stateRef.current=novaState

  const pollAudioRef = useRef<number>(0)

  // ── AudioGate: mute mic while speaking ──
  const isAgentSpeaking = useRef(false)
  const clapCtxRef = useRef<AudioContext | null>(null)
  const clapStreamRef = useRef<MediaStream | null>(null)
  const clapRafRef = useRef<number>(0)

  function micMute() {
    isAgentSpeaking.current = true
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }
    clearTimeout(restartTimeoutRef.current)
    if (clapRafRef.current) {
      cancelAnimationFrame(clapRafRef.current)
      clapRafRef.current = 0
    }
    if (clapCtxRef.current) {
      try { clapCtxRef.current.close() } catch {}
      clapCtxRef.current = null
    }
    if (clapStreamRef.current) {
      try { clapStreamRef.current.getTracks().forEach(t => t.stop()) } catch {}
      clapStreamRef.current = null
    }
  }

  const micUnmute = useCallback(() => {
    isAgentSpeaking.current = false
    // Re-start listening after a brief delay so audio system settles
    setTimeout(() => startRecRef.current?.(), 300)
  }, [])

  // ── Wake-word pending ──
  const wakeWordPending = useRef(false)
  const listenTimeoutRef = useRef<number>(0)

  const sendCommand = useCallback(async (text: string) => {
    setNovaState('thinking')
    clearTimeout(pollAudioRef.current)
    try {
      const res = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (data.widget) {
        setWidgetData(data.widget)
        setOverlay(true)
      } else if (data.intent === 'hide_overlay' || data.intent === 'stand_down') {
        setOverlay(false)
        setWidgetData(null)
      }
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
                micMute()
                const audio = new Audio(`/api/audio/${id}.mp3`)
                audioRef.current = audio
                audio.onplay = () => setNovaState('speaking')
                audio.onended = () => {
                  setNovaState('idle')
                  audioRef.current = null
                  micUnmute()
                }
                audio.onerror = () => {
                  setNovaState('idle')
                  audioRef.current = null
                  micUnmute()
                }
                audio.play().catch(() => {
                  setNovaState('idle')
                  micUnmute()
                })
              } else {
                poll()
              }
            } catch { poll() }
          }, 500)
        }
        poll()
      } else {
        setTimeout(() => setNovaState('idle'), 800)
      }
    } catch {
      setNovaState('idle')
    }
  }, [])

  // ── SpeechRecognition with wake-word ──
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    let recognition: any
    let stopped = false
    let permissionDenied = false

    function startRec() {
      startRecRef.current = startRec
      if (stopped || permissionDenied) return
      if (isAgentSpeaking.current) {
        restartTimeoutRef.current = window.setTimeout(startRec, 500)
        return
      }
      try {
        recognition = new SpeechRecognition()
        recognitionRef.current = recognition
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = 'en-US'

        recognition.onresult = (ev: any) => {
          // AudioGate: discard all mic input while agent speaks
          if (isAgentSpeaking.current) return
          if (stateRef.current === 'thinking' || stateRef.current === 'speaking') return

          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const raw = ev.results[i][0].transcript.trim()
            if (!raw) continue
            const lower = raw.toLowerCase()

            // If wake word is pending, treat this utterance as the command
            if (wakeWordPending.current) {
              wakeWordPending.current = false
              clearTimeout(listenTimeoutRef.current)
              setNovaState('idle')
              sendCommand(raw)
              return
            }

            // Look for wake word "nova"
            const novaIdx = lower.indexOf('nova')
            if (novaIdx !== -1) {
              const after = lower.slice(novaIdx + 4).trim()
              if (after) {
                // "nova show wallet" → command after wake word
                sendCommand(raw.slice(novaIdx + 4).trim())
              } else {
                // "nova" alone → enter listening mode, wait for next utterance
                wakeWordPending.current = true
                setNovaState('listening')
                clearTimeout(listenTimeoutRef.current)
                listenTimeoutRef.current = window.setTimeout(() => {
                  wakeWordPending.current = false
                  setNovaState('idle')
                }, 8000)
              }
              return
            }
          }
        }

        recognition.onerror = (err: any) => {
          if (err.error === 'not-allowed') {
            permissionDenied = true
            return
          }
          if (!stopped && !isAgentSpeaking.current) {
            restartTimeoutRef.current = window.setTimeout(startRec, 1000)
          }
        }

        recognition.onend = () => {
          if (!stopped && !permissionDenied && !isAgentSpeaking.current) {
            restartTimeoutRef.current = window.setTimeout(startRec, 500)
          }
        }

        recognition.start()
      } catch {
        if (!stopped && !isAgentSpeaking.current) {
          restartTimeoutRef.current = window.setTimeout(startRec, 1000)
        }
      }
    }

    startRec()

    return () => {
      stopped = true
      clearTimeout(restartTimeoutRef.current)
      clearTimeout(listenTimeoutRef.current)
      try { if (recognition) recognition.abort() } catch {}
      recognitionRef.current = null
    }
  }, [sendCommand])

  // ── Clap detection (Electron desktop) ──
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

        clapCtxRef.current = audioCtx
        clapStreamRef.current = stream

        function detect() {
          if (isAgentSpeaking.current) {
            raf = requestAnimationFrame(detect)
            return
          }
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

      const st=stateRef.current
      const passive=st==='idle'
      const energy=st==='speaking'?0.3:st==='listening'||st==='thinking'?0.15:0
      const boltCount=passive?4:12
      const boltAlpha=passive?0.06:0.4
      const boltSpeed=passive?0.4:1

      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r*1.2)
      if (passive) {
        glow.addColorStop(0,'rgba(120,180,255,0.04)')
        glow.addColorStop(0.5,'rgba(255,100,180,0.02)')
      } else {
        glow.addColorStop(0,'rgba(120,180,255,0.12)')
        glow.addColorStop(0.5,'rgba(255,100,180,0.06)')
      }
      glow.addColorStop(1,'transparent')
      ctx.fillStyle=glow
      ctx.beginPath()
      ctx.arc(cx,cy,r*1.2,0,Math.PI*2)
      ctx.fill()

      const shown=bolts.slice(0,boltCount)
      for(const bolt of shown){
        bolt.life+=0.5*boltSpeed
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
        ctx.globalAlpha=Math.min(bolt.alpha*f,boltAlpha)
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
      const isActive=st==='thinking'||st==='speaking'||st==='listening'
      const energy=st==='speaking'?0.3:st==='listening'?0.15:0
      const amp=isActive?22*(1+energy*1.5):4

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

  function closeOverlay(){
    setOverlay(false)
    setWidgetData(null)
  }

  function DynamicWidget({ widget }: { widget: WidgetData }) {
    if (widget.type === 'stats' && Array.isArray(widget.data)) {
      return (
        <>
          <h3>{widget.title}</h3>
          <div className="stat-grid">
            {(widget.data as {label:string;value:string|number}[]).map((s,i) => (
              <div key={i} className="stat-card">
                <div className="label">{s.label}</div>
                <div className="value">{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )
    }
    if (widget.type === 'table') {
      const { columns, rows } = widget.data
      return (
        <>
          <h3>{widget.title}</h3>
          <table className="widget-table">
            <thead><tr>{columns.map((c:string,i:number) => <th key={i}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((r:any[],i:number) => <tr key={i}>{r.map((v:any,j:number) => <td key={j}>{v}</td>)}</tr>)}</tbody>
          </table>
        </>
      )
    }
    if (widget.type === 'chart') {
      const { labels, values } = widget.data
      const max = Math.max(...values, 1)
      return (
        <>
          <h3>{widget.title}</h3>
          <div className="bar-chart">
            {values.map((v:number,i:number) => (
              <div key={i} className="bar" style={{height:`${(v/max)*100}%`}} title={`${labels[i]}: ${v}`} />
            ))}
          </div>
          <div className="chart-labels">{labels.join(' · ')}</div>
        </>
      )
    }
    if (widget.type === 'text') {
      return (
        <>
          <h3>{widget.title}</h3>
          <div className="widget-text">{(widget.data as any).content || widget.data}</div>
        </>
      )
    }
    return (
      <>
        <h3>{widget.title || 'Data'}</h3>
        <pre className="widget-raw">{JSON.stringify(widget.data, null, 2)}</pre>
      </>
    )
  }

  return (
    <div>
      <div className="rainbow-bg" />
      <div className={`orb-container ${novaState}`}>
        <div className="orb-ring" />
        <canvas ref={miniOrbRef} />
      </div>
      <canvas id="wave-canvas" ref={waveRef} />
      <div className={`glass-overlay ${overlay?'active':''}`}>
        <div className="backdrop" onClick={closeOverlay} />
        <div className="panel">
          <button className="close-btn" onClick={closeOverlay}>✕</button>
          {widgetData && <DynamicWidget widget={widgetData} />}
        </div>
      </div>
    </div>
  )
}
