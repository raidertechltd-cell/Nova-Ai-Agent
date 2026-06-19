import React, { useEffect, useRef, useState } from 'react'

export default function HardReset(){
  const [overlayVisible, setOverlayVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement|null>(null)
  const barsRef = useRef<HTMLDivElement[] | null>(null)

  useEffect(()=>{
    // Setup audio analyser to drive waveform bars
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let raf = 0

    async function initAudio(){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({audio:true})
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const src = audioCtx.createMediaStreamSource(stream)
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)

        const data = new Uint8Array(analyser.frequencyBinCount)

        const bars = barsRef.current || []
        function tick(){
          if(!analyser) return
          analyser.getByteFrequencyData(data)
          for(let i=0;i<bars.length;i++){
            const v = data[i % data.length] / 255
            const h = 12 + v * 120
            const barEl = bars[i] as HTMLDivElement
            if (barEl) {
              barEl.style.height = `${h}px`
              barEl.style.opacity = `${0.35 + v*0.9}`
            }
          }
          raf = requestAnimationFrame(tick)
        }
        tick()
      }catch(e){
        // microphone permission denied or unavailable — keep default subtle animation
        const bars = barsRef.current || []
        let t = 0
        function idle(){
          t += 0.02
          for(let i=0;i<bars.length;i++){
            const v = (Math.sin(t + i*0.3) + 1)/2
            const h = 12 + v * 80
            const barEl = bars[i] as HTMLDivElement
            if (barEl) {
              barEl.style.height = `${h}px`
              barEl.style.opacity = `${0.4 + v*0.6}`
            }
          }
          raf = requestAnimationFrame(idle)
        }
        idle()
      }
    }

    initAudio()

    // Speech recognition for voice-trigger
    let recognition: any = null
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      try {
        recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = 'en-US'
        recognition.onresult = (ev: any) => {
          for (let i = ev.resultIndex; i < ev.results.length; ++i) {
            const transcript = ev.results[i][0].transcript.trim().toLowerCase()
            console.log('voice transcript', transcript)
            // trigger phrases: 'open overlay', 'nova open', or just 'open'
            if (transcript.includes('open overlay') || transcript.includes('nova open') || transcript === 'open') {
              setOverlayVisible(true)
              // send simple confirmation audio
              try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance('Opening overlay')) } catch(e){}
              // notify backend (fire-and-forget) - use absolute backend URL in dev
              fetch('http://localhost:4000/api/voice-command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: transcript }) })
                .then(async r => {
                  let j = null
                  try { j = await r.json() } catch(e){ console.log('voice-command no-json', r.status); return }
                  console.log('voice-command response', j)
                  // If backend returned base64 audio, play it
                  if (j && j.audio) {
                    try {
                      const src = `data:audio/mpeg;base64,${j.audio}`
                      const a = new Audio(src)
                      a.play().catch(err => { console.warn('audio play failed', err) })
                    } catch (e) { console.warn('playback error', e) }
                    return
                  }
                  // Fallback: use browser TTS for reply text
                  if (j && j.reply) {
                    try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(j.reply)) } catch(e){ console.warn('tts error', e) }
                  }
                })
                .catch(e=>console.warn('voice-command post failed',e))
            }
          }
        }
        recognition.onerror = (e: any) => console.warn('speech error', e)
        recognition.onend = () => { try { recognition.start() } catch(e){} }
        recognition.start()
      } catch (e) {
        console.warn('SpeechRecognition init failed', e)
      }
    }

    return ()=>{
      if(raf) cancelAnimationFrame(raf)
      if(audioCtx) audioCtx.close()
      try { if(recognition) recognition.onend = null; if(recognition) recognition.stop() } catch(e){}
    }
  },[])

  const bars = new Array(12).fill(0)

  return (
    <div ref={containerRef} style={{position:'fixed',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#ffffff'}}>
      <div style={{display:'grid',placeItems:'center',width:'100%',height:'100%'}}>
        <div className="rainbow-ring" style={{['--size' as any]:'220px'}}>
          <div style={{width:160,height:160,borderRadius:80,display:'block'}} />
        </div>
      </div>

      <div style={{position:'fixed',left:0,right:0,bottom:28,height:120,display:'flex',alignItems:'flex-end',justifyContent:'center',gap:6}}>
        <div style={{display:'flex',gap:6,alignItems:'flex-end'}}>
          {bars.map((_,i)=> (
            <div key={i} ref={el=>{ if(!barsRef.current) barsRef.current=[]; if(el) barsRef.current[i]=el }} className="hr-bar" style={{width:8,height:20,borderRadius:4,background:'linear-gradient(180deg, magenta, deepskyblue)'}} />
          ))}
        </div>
      </div>

      {/* Glass overlay triggered by voice; initially hidden */}
      <div className={`glass-overlay ${overlayVisible ? 'active' : ''}`} style={{pointerEvents: overlayVisible ? 'auto' : 'none'}}>
        <div className="backdrop" />
        <div className="panel" role="dialog" aria-hidden={!overlayVisible}>
          <button className="close-btn" onClick={()=>setOverlayVisible(false)} aria-label="Close">×</button>
        </div>
      </div>

      
    </div>
  )
}
