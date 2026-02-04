'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type State = 'init' | 'media' | 'ready' | 'connecting' | 'connected' | 'failed'

const cache = new Map<string, string>()

export default function VideoCall() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const initialLang = (searchParams.get('lang') as 'en' | 'es') || 'en'

  const [state, setState] = useState<State>('init')
  const [status, setStatus] = useState('Starting...')
  const [logs, setLogs] = useState<string[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [copied, setCopied] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Language state - can change during call
  const [myLang, setMyLang] = useState<'en' | 'es'>(initialLang)
  const [showLangMenu, setShowLangMenu] = useState(false)
  const theirLang = myLang === 'en' ? 'es' : 'en'

  // Subtitles
  const [subs, setSubs] = useState<{id: string, who: 'me'|'them', text: string, trans: string}[]>([])
  const [live, setLive] = useState('')
  const [listening, setListening] = useState(false)

  // Refs
  const localVidRef = useRef<HTMLVideoElement>(null)
  const remoteVidRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<any>(null)
  const connRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<any>(null)
  const mountedRef = useRef(true)
  const retriesRef = useRef(0)
  const langRef = useRef(myLang)

  // Keep langRef in sync
  useEffect(() => { langRef.current = myLang }, [myLang])

  const log = useCallback((m: string) => {
    console.log(`[VOX] ${m}`)
    setLogs(p => [...p.slice(-40), `${new Date().toLocaleTimeString()}: ${m}`])
  }, [])

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'turn:a.relay.metered.ca:80', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
    { urls: 'turn:a.relay.metered.ca:443', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
    { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ]

  // Ultra-fast translation
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim()) return ''
    const key = `${from}>${to}:${text.trim().toLowerCase()}`
    if (cache.has(key)) return cache.get(key)!
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`)
      const d = await r.json()
      const t = d.responseData?.translatedText || text
      cache.set(key, t)
      return t
    } catch { return text }
  }, [])

  const addSub = useCallback((who: 'me'|'them', text: string, trans: string) => {
    const id = Math.random().toString(36).slice(2)
    setSubs(p => [...p.slice(-4), { id, who, text, trans }])
    setTimeout(() => setSubs(p => p.filter(s => s.id !== id)), 6000)
  }, [])

  const send = useCallback((data: any) => {
    if (connRef.current?.open) {
      connRef.current.send(JSON.stringify(data))
    }
  }, [])

  // Handle speech - translate and send
  const onSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return
    const currentLang = langRef.current
    const targetLang = currentLang === 'en' ? 'es' : 'en'
    log(`[${currentLang.toUpperCase()}] "${text}"`)
    const trans = await translate(text, currentLang, targetLang)
    addSub('me', text, trans)
    send({ type: 'sub', text, trans, lang: currentLang })
  }, [log, translate, addSub, send])

  // Setup speech recognition
  const setupSpeech = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { log('No speech recognition'); return }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current === 'en' ? 'en-US' : 'es-ES'

    rec.onstart = () => setListening(true)
    rec.onend = () => {
      setListening(false)
      if (mountedRef.current && state === 'connected' && !muted) {
        setTimeout(() => { try { rec.start() } catch {} }, 100)
      }
    }
    rec.onerror = () => {}
    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLive(interim)
      if (final) { setLive(''); onSpeech(final) }
    }
    recRef.current = rec
  }, [state, muted, log, onSpeech])

  const toggleRec = useCallback((on: boolean) => {
    if (!recRef.current) setupSpeech()
    try {
      if (on) recRef.current?.start()
      else recRef.current?.stop()
    } catch {}
  }, [setupSpeech])

  // Change language - restarts speech recognition with new language
  const changeLanguage = useCallback((newLang: 'en' | 'es') => {
    setMyLang(newLang)
    setShowLangMenu(false)
    log(`Language changed to ${newLang.toUpperCase()}`)

    // Restart speech recognition with new language
    if (recRef.current) {
      try { recRef.current.stop() } catch {}
      recRef.current = null
    }

    // Notify peer of language change
    send({ type: 'lang', lang: newLang })

    // Restart recognition after brief delay
    setTimeout(() => {
      if (state === 'connected' && !muted) {
        setupSpeech()
        toggleRec(true)
      }
    }, 300)
  }, [log, send, state, muted, setupSpeech, toggleRec])

  const setupConn = useCallback((conn: any) => {
    connRef.current = conn
    conn.on('open', () => {
      log('Data channel open')
      if (!isHost && state !== 'connected') {
        setState('connected')
        setStatus('Connected!')
        toggleRec(true)
      }
    })
    conn.on('data', (d: string) => {
      try {
        const msg = JSON.parse(d)
        if (msg.type === 'sub') {
          addSub('them', msg.text, msg.trans)
        } else if (msg.type === 'lang') {
          log(`Peer changed language to ${msg.lang.toUpperCase()}`)
        }
      } catch {}
    })
    conn.on('close', () => log('Data closed'))
    conn.on('error', (e: any) => log(`Data error: ${e}`))
  }, [log, isHost, state, addSub, toggleRec])

  // Get camera stream
  const getStream = useCallback(async (facing: 'user' | 'environment') => {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
  }, [])

  // Flip camera
  const flipCamera = useCallback(async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    log(`Flipping camera to ${newFacing}`)

    try {
      const newStream = await getStream(newFacing)

      // Stop old video track
      const oldVideoTrack = streamRef.current?.getVideoTracks()[0]
      if (oldVideoTrack) oldVideoTrack.stop()

      // Get new video track
      const newVideoTrack = newStream.getVideoTracks()[0]

      // Update local video
      if (localVidRef.current) {
        const audioTrack = streamRef.current?.getAudioTracks()[0]
        const tracks = audioTrack ? [newVideoTrack, audioTrack] : [newVideoTrack]
        localVidRef.current.srcObject = new MediaStream(tracks)
      }

      // Replace track in peer connection
      if (callRef.current?.peerConnection) {
        const senders = callRef.current.peerConnection.getSenders()
        const videoSender = senders.find((s: any) => s.track?.kind === 'video')
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack)
        }
      }

      // Update stream ref
      if (streamRef.current) {
        streamRef.current.removeTrack(streamRef.current.getVideoTracks()[0])
        streamRef.current.addTrack(newVideoTrack)
      }

      setFacingMode(newFacing)

      // Stop unused audio from new stream
      newStream.getAudioTracks().forEach(t => t.stop())

    } catch (err: any) {
      log(`Flip camera error: ${err.message}`)
    }
  }, [facingMode, getStream, log])

  const connect = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      setState('media')
      setStatus('Accessing camera...')
      log('Getting media...')

      const stream = await getStream(facingMode)

      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }

      streamRef.current = stream
      if (localVidRef.current) localVidRef.current.srcObject = stream
      log('Camera ready')

      setState('ready')
      setStatus(isHost ? 'Creating room...' : 'Joining room...')

      const Peer = (await import('peerjs')).default

      const peer = new Peer(isHost ? roomId : undefined, {
        debug: 2,
        config: { iceServers, iceCandidatePoolSize: 10, iceTransportPolicy: 'all' }
      })

      peerRef.current = peer

      peer.on('open', (id) => {
        log(`Peer ID: ${id}`)

        if (isHost) {
          setStatus('Waiting for guest...')
          setState('ready')
        } else {
          setStatus('Connecting...')
          setState('connecting')

          log(`Connecting to ${roomId}...`)
          const conn = peer.connect(roomId, { reliable: true, serialization: 'json' })
          setupConn(conn)

          const call = peer.call(roomId, stream)
          if (call) {
            callRef.current = call
            call.on('stream', (remoteStream) => {
              log('Got remote video!')
              if (remoteVidRef.current) remoteVidRef.current.srcObject = remoteStream
              setState('connected')
              setStatus('Connected!')
              toggleRec(true)
            })
            call.on('close', () => { log('Call ended'); setState('failed'); setStatus('Call ended') })
            call.on('error', (e) => log(`Call error: ${e}`))
          } else {
            log('Call failed')
            setState('failed')
            setStatus('Could not reach host')
          }
        }
      })

      peer.on('connection', (conn) => {
        log('Guest connected (data)')
        setupConn(conn)
      })

      peer.on('call', (call) => {
        log('Incoming call - answering')
        call.answer(stream)
        callRef.current = call
        call.on('stream', (remoteStream) => {
          log('Got guest video!')
          if (remoteVidRef.current) remoteVidRef.current.srcObject = remoteStream
          setState('connected')
          setStatus('Connected!')
          toggleRec(true)
        })
        call.on('close', () => { log('Call ended'); setStatus('Call ended') })
        call.on('error', (e) => log(`Call error: ${e}`))
      })

      peer.on('disconnected', () => {
        log('Disconnected - reconnecting...')
        if (mountedRef.current && state !== 'failed') peer.reconnect()
      })

      peer.on('error', (err: any) => {
        log(`Peer error: ${err.type}`)
        if (err.type === 'peer-unavailable') {
          setStatus('Room not found')
          setState('failed')
        } else if (err.type === 'unavailable-id') {
          if (retriesRef.current < 3) {
            retriesRef.current++
            peer.destroy()
            setTimeout(connect, 1000)
          } else {
            setStatus('Room unavailable')
            setState('failed')
          }
        } else if (err.type === 'network' || err.type === 'server-error') {
          if (retriesRef.current < 5) {
            retriesRef.current++
            setStatus(`Reconnecting (${retriesRef.current}/5)...`)
            setTimeout(() => { peer.destroy(); connect() }, 2000)
          } else {
            setStatus('Network error')
            setState('failed')
          }
        } else {
          setStatus(`Error: ${err.type}`)
          setState('failed')
        }
      })

    } catch (err: any) {
      log(`Error: ${err.message}`)
      setState('failed')
      setStatus(err.name === 'NotAllowedError' ? 'Camera access denied' : `Error: ${err.message}`)
    }
  }, [isHost, roomId, iceServers, facingMode, log, getStream, setupConn, toggleRec, state])

  const cleanup = useCallback(() => {
    try { recRef.current?.stop() } catch {}
    try { connRef.current?.close() } catch {}
    try { callRef.current?.close() } catch {}
    try { peerRef.current?.destroy() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  useEffect(() => {
    mountedRef.current = true
    setupSpeech()
    connect()
    return () => { mountedRef.current = false; cleanup() }
  }, [])

  const toggleMute = () => {
    const audio = streamRef.current?.getAudioTracks()[0]
    if (audio) {
      audio.enabled = !audio.enabled
      setMuted(!audio.enabled)
      if (!audio.enabled) toggleRec(false)
      else if (state === 'connected') toggleRec(true)
    }
  }

  const toggleVideo = () => {
    const video = streamRef.current?.getVideoTracks()[0]
    if (video) {
      video.enabled = !video.enabled
      setVideoOff(!video.enabled)
    }
  }

  const copy = () => {
    const link = `${window.location.origin}/call/${roomId}?host=false&lang=${theirLang}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => prompt('Copy link:', link))
  }

  const retry = () => {
    cleanup()
    retriesRef.current = 0
    setState('init')
    setTimeout(connect, 500)
  }

  const end = () => { cleanup(); router.push('/') }

  const statusColor = {
    init: 'bg-gray-400', media: 'bg-yellow-400', ready: 'bg-blue-400',
    connecting: 'bg-yellow-400 animate-pulse', connected: 'bg-green-500', failed: 'bg-red-500'
  }[state]

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-white text-sm font-medium">{status}</span>
          {listening && <span className="text-green-400 text-xs animate-pulse">● LIVE</span>}
        </div>
        <div className="flex items-center gap-3">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1 text-white text-xs font-medium transition-all"
            >
              {myLang === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showLangMenu && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg overflow-hidden shadow-xl border border-white/10">
                <button
                  onClick={() => changeLanguage('en')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-white/10 ${myLang === 'en' ? 'text-blue-400' : 'text-white'}`}
                >
                  🇺🇸 English
                </button>
                <button
                  onClick={() => changeLanguage('es')}
                  className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-white/10 ${myLang === 'es' ? 'text-blue-400' : 'text-white'}`}
                >
                  🇪🇸 Español
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowLogs(!showLogs)} className="text-gray-400 text-xs hover:text-white">
            {showLogs ? 'Hide' : 'Logs'}
          </button>
        </div>
      </div>

      {showLogs && (
        <div className="absolute top-12 left-2 right-2 z-30 bg-black/95 rounded-lg p-2 max-h-40 overflow-y-auto text-xs font-mono">
          {logs.map((l, i) => <div key={i} className="text-green-400">{l}</div>)}
        </div>
      )}

      {/* Main video */}
      <div className="flex-1 relative">
        <video ref={remoteVidRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

        {state !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black">
            <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <svg className="w-12 h-12 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
            <p className="text-white text-lg font-medium">{status}</p>
            {state === 'connecting' && (
              <div className="mt-4 flex gap-1">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: `${d}ms`}}/>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Local video PIP */}
        <div className="absolute top-16 right-3 w-28 h-40 md:w-36 md:h-52 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20">
          <video
            ref={localVidRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${videoOff ? 'hidden' : ''} ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
          {videoOff && (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {/* Flip camera button on PIP */}
          <button
            onClick={flipCamera}
            className="absolute top-1 left-1 bg-black/50 hover:bg-black/70 rounded-full p-1.5 transition-all"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          {muted && (
            <div className="absolute bottom-1 right-1 bg-red-500 rounded-full p-1">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Share link panel */}
        {isHost && (state === 'ready' || state === 'media') && (
          <div className="absolute top-32 left-3 right-3 md:left-auto md:right-3 md:w-80 bg-black/90 backdrop-blur-xl rounded-2xl p-4 border border-white/10">
            <p className="text-white text-sm font-medium mb-2">Share this link</p>
            <p className="text-gray-400 text-xs mb-3">Send to the person you want to call</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/call/${roomId}?host=false&lang=${theirLang}`}
                className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-white text-xs border border-white/10"
              />
              <button
                onClick={copy}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-gray-200'}`}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Subtitles */}
        <div className="absolute bottom-28 left-3 right-3 space-y-2 pointer-events-none">
          {live && (
            <div className="bg-blue-500/90 backdrop-blur rounded-xl px-4 py-2 max-w-[85%] ml-auto">
              <p className="text-white text-sm">{live}</p>
              <p className="text-blue-200 text-xs">speaking...</p>
            </div>
          )}
          {subs.map(s => (
            <div
              key={s.id}
              className={`backdrop-blur rounded-xl px-4 py-2.5 max-w-[85%] ${
                s.who === 'me' ? 'bg-blue-500/90 ml-auto' : 'bg-white/95 mr-auto'
              }`}
            >
              <p className={`text-sm font-medium ${s.who === 'me' ? 'text-white' : 'text-gray-900'}`}>
                {s.who === 'me' ? s.text : s.trans}
              </p>
              <p className={`text-xs mt-0.5 ${s.who === 'me' ? 'text-blue-200' : 'text-gray-500'}`}>
                {s.who === 'me' ? s.trans : s.text}
              </p>
            </div>
          ))}
        </div>

        {/* Retry overlay */}
        {state === 'failed' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur flex flex-col items-center justify-center">
            <p className="text-white text-xl font-medium mb-2">{status}</p>
            <p className="text-gray-400 text-sm mb-6">Please try again</p>
            <button onClick={retry} className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition-all">
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex justify-center items-center gap-4">
          {/* Flip camera */}
          <button
            onClick={flipCamera}
            className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}
          >
            {muted ? (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            )}
          </button>

          {/* Video */}
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${videoOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}
          >
            {videoOff ? (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* End call */}
          <button onClick={end} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          {isHost ? 'Host' : 'Guest'} • {myLang === 'en' ? 'English' : 'Spanish'} → {theirLang === 'en' ? 'English' : 'Spanish'}
        </p>
      </div>
    </div>
  )
}
