'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type State = 'init' | 'media' | 'ready' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
type TextSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl'
type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'bad'
type SubtitlePosition = 'bottom' | 'top' | 'split'

interface Participant {
  id: string
  name: string
  stream: MediaStream | null
  isSpeaking: boolean
  isMuted: boolean
  isVideoOff: boolean
  audioLevel: number
  language: 'en' | 'es'
}

interface LogEntry {
  id: string
  speaker: string
  text: string
  translated: string
  time: string
  isRemote: boolean
  speakerLang: 'en' | 'es'
}

interface SubtitleDisplay {
  id: string
  speaker: string
  original: string
  translated: string
  isRemote: boolean
  speakerLang: 'en' | 'es'
  timestamp: number
}

const cache = new Map<string, string>()

export default function VideoCall() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || (isHost ? 'Host' : 'Guest')
  const initialLang = (searchParams.get('lang') as 'en' | 'es') || 'en'

  // Core state
  const [state, setState] = useState<State>('init')
  const [status, setStatus] = useState('Starting...')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Language
  const [myLang, setMyLang] = useState<'en' | 'es'>(initialLang)
  const [theirLang, setTheirLang] = useState<'en' | 'es'>(initialLang === 'en' ? 'es' : 'en')
  const [showLangMenu, setShowLangMenu] = useState(false)

  // Accessibility & UI
  const [textSize, setTextSize] = useState<TextSize>('lg')
  const [showTextSizeMenu, setShowTextSizeMenu] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>('bottom')
  const [showSubtitleSettings, setShowSubtitleSettings] = useState(false)

  // Conversation log
  const [log, setLog] = useState<LogEntry[]>([])

  // Enhanced subtitle system - shows both parties' translations prominently
  const [mySubtitle, setMySubtitle] = useState<SubtitleDisplay | null>(null)
  const [theirSubtitle, setTheirSubtitle] = useState<SubtitleDisplay | null>(null)
  const [liveText, setLiveText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null)

  // Participants for group call
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map())

  // New features
  const [callDuration, setCallDuration] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('good')
  const [myAudioLevel, setMyAudioLevel] = useState(0)
  const [speakTranslations, setSpeakTranslations] = useState(false)
  const [soundsEnabled, setSoundsEnabled] = useState(true)
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)

  // Reactions
  const [showReactions, setShowReactions] = useState(false)
  const [activeReaction, setActiveReaction] = useState<string | null>(null)
  const [remoteReaction, setRemoteReaction] = useState<string | null>(null)

  // Debug
  const [logs, setLogs] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [copied, setCopied] = useState(false)

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const peerRef = useRef<any>(null)
  const connectionsRef = useRef<Map<string, any>>(new Map())
  const callsRef = useRef<Map<string, any>>(new Map())
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<any>(null)
  const mountedRef = useRef(true)
  const retriesRef = useRef(0)
  const langRef = useRef(myLang)
  const logEndRef = useRef<HTMLDivElement>(null)
  const mySubTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const theirSubTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const stateRef = useRef<State>('init')
  const mutedRef = useRef(false)
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)
  const wakeLockRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const remoteReactionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Keep refs in sync with state
  useEffect(() => { langRef.current = myLang }, [myLang])
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log, autoScroll])

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      dbg('Back online')
      if (stateRef.current === 'reconnecting') {
        dbg('Attempting to reconnect...')
        retry()
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      dbg('Went offline')
      if (stateRef.current === 'connected') {
        setState('reconnecting')
        setStatus('Connection lost. Reconnecting...')
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Screen Wake Lock - Keep screen on during calls
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && state === 'connected') {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
          dbg('Screen wake lock acquired')
        } catch (err) {
          dbg('Wake lock failed')
        }
      }
    }

    if (state === 'connected') {
      requestWakeLock()
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    }
  }, [state])

  // Call duration timer
  useEffect(() => {
    if (state === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
        callTimerRef.current = null
      }
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [state])

  // Audio level monitoring
  useEffect(() => {
    if (streamRef.current && state === 'connected') {
      try {
        audioContextRef.current = new AudioContext()
        analyserRef.current = audioContextRef.current.createAnalyser()
        const source = audioContextRef.current.createMediaStreamSource(streamRef.current)
        source.connect(analyserRef.current)
        analyserRef.current.fftSize = 256

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

        const checkLevel = () => {
          if (analyserRef.current && mountedRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray)
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length
            setMyAudioLevel(avg / 255)
            requestAnimationFrame(checkLevel)
          }
        }
        checkLevel()
      } catch (e) {
        dbg('Audio level monitoring failed')
      }
    }

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [state])

  // Connection quality monitoring
  useEffect(() => {
    if (state === 'connected' && callsRef.current.size > 0) {
      statsIntervalRef.current = setInterval(async () => {
        try {
          const call = Array.from(callsRef.current.values())[0]
          if (call?.peerConnection) {
            const stats = await call.peerConnection.getStats()
            let packetsLost = 0
            let packetsReceived = 0
            let roundTripTime = 0

            stats.forEach((report: any) => {
              if (report.type === 'inbound-rtp' && report.kind === 'video') {
                packetsLost = report.packetsLost || 0
                packetsReceived = report.packetsReceived || 0
              }
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                roundTripTime = report.currentRoundTripTime || 0
              }
            })

            const lossRate = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0

            if (lossRate > 0.1 || roundTripTime > 0.5) {
              setConnectionQuality('bad')
              if (!lowBandwidthMode) {
                setLowBandwidthMode(true)
                dbg('Switching to low bandwidth mode')
              }
            } else if (lossRate > 0.05 || roundTripTime > 0.3) {
              setConnectionQuality('poor')
            } else if (lossRate > 0.01 || roundTripTime > 0.15) {
              setConnectionQuality('good')
            } else {
              setConnectionQuality('excellent')
            }
          }
        } catch (e) {}
      }, 5000)
    }

    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current)
    }
  }, [state, lowBandwidthMode])

  const dbg = useCallback((m: string) => {
    console.log(`[VOX] ${m}`)
    setLogs(p => [...p.slice(-50), `${new Date().toLocaleTimeString()}: ${m}`])
  }, [])

  // Play sound effect
  const playSound = useCallback((type: 'join' | 'leave' | 'message') => {
    if (!soundsEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      if (type === 'join') {
        oscillator.frequency.value = 880
        gainNode.gain.value = 0.1
      } else if (type === 'leave') {
        oscillator.frequency.value = 440
        gainNode.gain.value = 0.1
      } else {
        oscillator.frequency.value = 660
        gainNode.gain.value = 0.05
      }

      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.15)
    } catch (e) {}
  }, [soundsEnabled])

  // Speak translation using TTS
  const speakText = useCallback((text: string, lang: 'en' | 'es') => {
    if (!speakTranslations || typeof window === 'undefined') return
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang === 'en' ? 'en-US' : 'es-ES'
      utterance.rate = 1.1
      utterance.volume = 0.8
      speechSynthesis.speak(utterance)
    } catch (e) {}
  }, [speakTranslations])

  // Vibrate on events (mobile)
  const vibrate = useCallback((pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern) } catch {}
    }
  }, [])

  // Format duration
  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Text size classes
  const textSizeClass = {
    sm: 'text-base',
    base: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl',
    '2xl': 'text-3xl'
  }[textSize]

  const textSizeSubClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl'
  }[textSize]

  // Connection quality colors
  const qualityColor = {
    excellent: 'text-green-400',
    good: 'text-green-400',
    poor: 'text-yellow-400',
    bad: 'text-red-400'
  }[connectionQuality]

  const qualityBars = {
    excellent: 4,
    good: 3,
    poor: 2,
    bad: 1
  }[connectionQuality]

  // ICE servers
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
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ]

  // Translation with local API
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim()) return ''
    const key = `${from}>${to}:${text.trim().toLowerCase()}`
    if (cache.has(key)) return cache.get(key)!
    try {
      // Use local API for better reliability
      const r = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang: from, targetLang: to })
      })
      const d = await r.json()
      const t = d.translation || text
      cache.set(key, t)
      return t
    } catch {
      // Fallback to MyMemory directly
      try {
        const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`)
        const d = await r.json()
        const t = d.responseData?.translatedText || text
        cache.set(key, t)
        return t
      } catch { return text }
    }
  }, [])

  // Add to log and show subtitle - ENHANCED for bidirectional clarity
  const addToLog = useCallback((speaker: string, text: string, translated: string, isRemote: boolean, speakerLang: 'en' | 'es') => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      speaker,
      text,
      translated,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isRemote,
      speakerLang
    }
    setLog(prev => [...prev, entry])

    // Create subtitle display object
    const subtitle: SubtitleDisplay = {
      id: Date.now().toString(),
      speaker,
      original: text,
      translated,
      isRemote,
      speakerLang,
      timestamp: Date.now()
    }

    // Show subtitle in appropriate position based on who spoke
    if (isRemote) {
      // Their subtitle - what they said and translation for me
      setTheirSubtitle(subtitle)
      if (theirSubTimeoutRef.current) clearTimeout(theirSubTimeoutRef.current)
      theirSubTimeoutRef.current = setTimeout(() => setTheirSubtitle(null), 8000)

      // Play sound and speak for remote messages
      playSound('message')
      vibrate(50)
      speakText(translated, langRef.current)
    } else {
      // My subtitle - what I said and translation for them
      setMySubtitle(subtitle)
      if (mySubTimeoutRef.current) clearTimeout(mySubTimeoutRef.current)
      mySubTimeoutRef.current = setTimeout(() => setMySubtitle(null), 6000)
    }
  }, [playSound, vibrate, speakText])

  // Broadcast to all peers
  const broadcast = useCallback((data: any) => {
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn?.open) {
        try {
          conn.send(JSON.stringify(data))
        } catch (e) {
          dbg(`Broadcast error to ${peerId}: ${e}`)
        }
      }
    })
  }, [dbg])

  // Send reaction
  const sendReaction = useCallback((emoji: string) => {
    setActiveReaction(emoji)
    if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current)
    reactionTimeoutRef.current = setTimeout(() => setActiveReaction(null), 2000)
    broadcast({ type: 'reaction', emoji })
    setShowReactions(false)
  }, [broadcast])

  // Handle speech
  const onSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return
    const currentLang = langRef.current
    const targetLang = currentLang === 'en' ? 'es' : 'en'
    dbg(`[${currentLang.toUpperCase()}] "${text}"`)
    const trans = await translate(text, currentLang, targetLang)
    addToLog(userName, text, trans, false, currentLang)
    setActiveSpeaker(userName)
    setTimeout(() => setActiveSpeaker(null), 2000)
    // Broadcast with speaker's language so remote can display correctly
    broadcast({ type: 'sub', speaker: userName, text, trans, lang: currentLang })
  }, [dbg, translate, addToLog, userName, broadcast])

  // Setup speech recognition
  const setupSpeech = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { dbg('No speech recognition'); return }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current === 'en' ? 'en-US' : 'es-ES'

    rec.onstart = () => setIsListening(true)
    rec.onend = () => {
      setIsListening(false)
      if (mountedRef.current && stateRef.current === 'connected' && !mutedRef.current) {
        setTimeout(() => { try { rec.start() } catch {} }, 100)
      }
    }
    rec.onerror = (e: any) => {
      dbg(`Speech error: ${e.error}`)
    }
    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveText(interim)
      if (final) { setLiveText(''); onSpeech(final) }
    }
    recRef.current = rec
  }, [dbg, onSpeech])

  const toggleRec = useCallback((on: boolean) => {
    if (!recRef.current) setupSpeech()
    try {
      if (on) recRef.current?.start()
      else recRef.current?.stop()
    } catch {}
  }, [setupSpeech])

  // Change language
  const changeLanguage = useCallback((newLang: 'en' | 'es') => {
    setMyLang(newLang)
    setShowLangMenu(false)
    dbg(`Language changed to ${newLang.toUpperCase()}`)
    if (recRef.current) {
      try { recRef.current.stop() } catch {}
      recRef.current = null
    }
    broadcast({ type: 'lang', speaker: userName, lang: newLang })
    setTimeout(() => {
      if (stateRef.current === 'connected' && !mutedRef.current) {
        setupSpeech()
        toggleRec(true)
      }
    }, 300)
  }, [dbg, broadcast, userName, setupSpeech, toggleRec])

  // Get stream
  const getStream = useCallback(async (facing: 'user' | 'environment') => {
    const constraints: MediaStreamConstraints = {
      video: lowBandwidthMode
        ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }
    return navigator.mediaDevices.getUserMedia(constraints)
  }, [lowBandwidthMode])

  // Flip camera
  const flipCamera = useCallback(async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    dbg(`Flipping to ${newFacing}`)

    try {
      const newStream = await getStream(newFacing)
      const newVideoTrack = newStream.getVideoTracks()[0]

      streamRef.current?.getVideoTracks().forEach(t => t.stop())

      if (localVideoRef.current && streamRef.current) {
        const audioTrack = streamRef.current.getAudioTracks()[0]
        streamRef.current = new MediaStream(audioTrack ? [newVideoTrack, audioTrack] : [newVideoTrack])
        localVideoRef.current.srcObject = streamRef.current
      }

      callsRef.current.forEach((call) => {
        if (call?.peerConnection) {
          const senders = call.peerConnection.getSenders()
          const videoSender = senders.find((s: any) => s.track?.kind === 'video')
          if (videoSender) videoSender.replaceTrack(newVideoTrack)
        }
      })

      setFacingMode(newFacing)
      newStream.getAudioTracks().forEach(t => t.stop())
    } catch (err: any) {
      dbg(`Flip error: ${err.message}`)
    }
  }, [facingMode, getStream, dbg])

  // Setup data connection
  const setupConn = useCallback((conn: any, peerId: string, peerName: string) => {
    dbg(`Setting up connection to ${peerName} (${peerId})`)
    connectionsRef.current.set(peerId, conn)

    conn.on('open', () => {
      dbg(`Data channel open: ${peerName}`)
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current)
        connectionTimeoutRef.current = null
      }
      try {
        conn.send(JSON.stringify({ type: 'join', name: userName, lang: langRef.current }))
      } catch (e) {
        dbg(`Error sending join: ${e}`)
      }
    })

    conn.on('data', (d: string) => {
      try {
        const msg = typeof d === 'string' ? JSON.parse(d) : d
        if (msg.type === 'sub') {
          // Received translation from remote - their original and translation
          // For the remote user: msg.text is their original, msg.trans is translation for me
          addToLog(msg.speaker, msg.text, msg.trans, true, msg.lang)
          setActiveSpeaker(msg.speaker)
          setTimeout(() => setActiveSpeaker(null), 2000)
        } else if (msg.type === 'join') {
          dbg(`${msg.name} joined speaking ${msg.lang}`)
          playSound('join')
          vibrate([50, 50, 50])
          setTheirLang(msg.lang)
          setParticipants(prev => {
            const updated = new Map(prev)
            const existing = updated.get(peerId)
            if (existing) {
              updated.set(peerId, { ...existing, name: msg.name, language: msg.lang })
            }
            return updated
          })
        } else if (msg.type === 'lang') {
          setTheirLang(msg.lang)
          setParticipants(prev => {
            const updated = new Map(prev)
            const existing = updated.get(peerId)
            if (existing) {
              updated.set(peerId, { ...existing, language: msg.lang })
            }
            return updated
          })
        } else if (msg.type === 'mute') {
          setParticipants(prev => {
            const updated = new Map(prev)
            const existing = updated.get(peerId)
            if (existing) {
              updated.set(peerId, { ...existing, isMuted: msg.muted })
            }
            return updated
          })
        } else if (msg.type === 'speaking') {
          setActiveSpeaker(msg.speaker)
          setTimeout(() => setActiveSpeaker(null), 1000)
        } else if (msg.type === 'reaction') {
          setRemoteReaction(msg.emoji)
          if (remoteReactionTimeoutRef.current) clearTimeout(remoteReactionTimeoutRef.current)
          remoteReactionTimeoutRef.current = setTimeout(() => setRemoteReaction(null), 2000)
        }
      } catch (e) {
        dbg(`Data parse error: ${e}`)
      }
    })

    conn.on('close', () => {
      dbg(`${peerName} disconnected`)
      playSound('leave')
      vibrate(100)
      connectionsRef.current.delete(peerId)
      setParticipants(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    })

    conn.on('error', (err: any) => {
      dbg(`Connection error with ${peerName}: ${err}`)
    })
  }, [dbg, userName, addToLog, playSound, vibrate])

  // Add participant
  const addParticipant = useCallback((peerId: string, name: string, stream: MediaStream | null) => {
    dbg(`Adding participant: ${name} (${peerId})`)
    playSound('join')
    vibrate([50, 50, 50])
    setParticipants(prev => {
      const updated = new Map(prev)
      updated.set(peerId, {
        id: peerId,
        name,
        stream,
        isSpeaking: false,
        isMuted: false,
        isVideoOff: false,
        audioLevel: 0,
        language: theirLang
      })
      return updated
    })
  }, [dbg, playSound, vibrate, theirLang])

  // Main connect
  const connect = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      setState('media')
      setStatus('Accessing camera...')
      dbg('Getting media...')

      const stream = await getStream(facingMode)
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }

      streamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      dbg('Camera ready')

      setState('ready')
      setStatus(isHost ? 'Creating room...' : 'Joining room...')

      const Peer = (await import('peerjs')).default
      const peerId = isHost ? roomId : `${roomId}-guest-${Date.now()}`

      dbg(`Creating peer with ID: ${peerId}`)

      const peer = new Peer(peerId, {
        debug: 2,
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
          iceTransportPolicy: 'all'
        }
      })

      peerRef.current = peer

      peer.on('open', (id) => {
        dbg(`Peer open with ID: ${id}`)

        if (isHost) {
          setStatus('Waiting for guests...')
          setState('ready')
        } else {
          setStatus('Connecting to host...')
          setState('connecting')

          dbg(`Attempting to connect to host: ${roomId}`)

          connectionTimeoutRef.current = setTimeout(() => {
            if (stateRef.current === 'connecting') {
              dbg('Connection timeout - retrying...')
              if (retriesRef.current < 3) {
                retriesRef.current++
                setStatus(`Retrying (${retriesRef.current}/3)...`)
                peer.destroy()
                setTimeout(connect, 1000)
              } else {
                setStatus('Could not connect to host')
                setState('failed')
              }
            }
          }, 15000)

          const conn = peer.connect(roomId, { reliable: true })
          setupConn(conn, roomId, 'Host')

          const call = peer.call(roomId, stream)
          if (call) {
            dbg('Call initiated to host')
            callsRef.current.set(roomId, call)

            call.on('stream', (remoteStream) => {
              dbg('Received host stream!')
              if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current)
                connectionTimeoutRef.current = null
              }
              addParticipant(roomId, 'Host', remoteStream)
              setState('connected')
              setStatus('Connected!')
              toggleRec(true)
            })

            call.on('close', () => {
              dbg('Host call closed')
              setParticipants(prev => {
                const updated = new Map(prev)
                updated.delete(roomId)
                return updated
              })
            })

            call.on('error', (err: any) => {
              dbg(`Call error: ${err}`)
            })
          } else {
            dbg('Failed to create call')
          }
        }
      })

      peer.on('connection', (conn) => {
        const incomingPeerId = conn.peer
        dbg(`Incoming data connection from: ${incomingPeerId}`)
        setupConn(conn, incomingPeerId, `Guest`)
      })

      peer.on('call', (call) => {
        const callerId = call.peer
        dbg(`Incoming call from: ${callerId}`)

        call.answer(stream)
        callsRef.current.set(callerId, call)

        call.on('stream', (remoteStream) => {
          dbg(`Received stream from: ${callerId}`)
          addParticipant(callerId, `Guest`, remoteStream)

          if (stateRef.current !== 'connected') {
            setState('connected')
            setStatus('Connected!')
            toggleRec(true)
          }
        })

        call.on('close', () => {
          dbg(`Call ended: ${callerId}`)
          callsRef.current.delete(callerId)
          setParticipants(prev => {
            const updated = new Map(prev)
            updated.delete(callerId)
            return updated
          })
        })

        call.on('error', (err: any) => {
          dbg(`Call error from ${callerId}: ${err}`)
        })
      })

      peer.on('disconnected', () => {
        dbg('Peer disconnected from server')
        if (mountedRef.current && stateRef.current !== 'failed') {
          dbg('Attempting to reconnect...')
          peer.reconnect()
        }
      })

      peer.on('error', (err: any) => {
        dbg(`Peer error: ${err.type} - ${err.message}`)

        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current)
          connectionTimeoutRef.current = null
        }

        if (err.type === 'peer-unavailable') {
          if (retriesRef.current < 3) {
            retriesRef.current++
            setStatus(`Host not found. Retrying (${retriesRef.current}/3)...`)
            setTimeout(() => {
              peer.destroy()
              connect()
            }, 2000)
          } else {
            setStatus('Host not found. Check the link.')
            setState('failed')
          }
        } else if (err.type === 'unavailable-id') {
          if (retriesRef.current < 3) {
            retriesRef.current++
            peer.destroy()
            setTimeout(connect, 1000)
          } else {
            setStatus('Room unavailable')
            setState('failed')
          }
        } else if ((err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') && retriesRef.current < 5) {
          retriesRef.current++
          setStatus(`Connection issue. Retrying (${retriesRef.current}/5)...`)
          setTimeout(() => { peer.destroy(); connect() }, 2000)
        } else {
          setStatus(`Connection error`)
          setState('failed')
        }
      })

      peer.on('close', () => {
        dbg('Peer connection closed')
      })

    } catch (err: any) {
      dbg(`Error: ${err.message}`)
      setState('failed')
      setStatus(err.name === 'NotAllowedError' ? 'Camera access denied' : `Error: ${err.message}`)
    }
  }, [isHost, roomId, facingMode, dbg, getStream, setupConn, addParticipant, toggleRec])

  const cleanup = useCallback(() => {
    dbg('Cleaning up...')
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
      wakeLockRef.current = null
    }
    try { recRef.current?.stop() } catch {}
    connectionsRef.current.forEach(c => { try { c.close() } catch {} })
    callsRef.current.forEach(c => { try { c.close() } catch {} })
    connectionsRef.current.clear()
    callsRef.current.clear()
    try { peerRef.current?.destroy() } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [dbg])

  useEffect(() => {
    mountedRef.current = true
    setupSpeech()
    connect()
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  const toggleMute = () => {
    const audio = streamRef.current?.getAudioTracks()[0]
    if (audio) {
      audio.enabled = !audio.enabled
      setMuted(!audio.enabled)
      if (!audio.enabled) toggleRec(false)
      else if (stateRef.current === 'connected') toggleRec(true)
      broadcast({ type: 'mute', muted: !audio.enabled })
    }
  }

  const toggleVideo = () => {
    const video = streamRef.current?.getVideoTracks()[0]
    if (video) {
      video.enabled = !video.enabled
      setVideoOff(!video.enabled)
    }
  }

  const getShareLink = () => `${window.location.origin}/call/${roomId}?host=false&lang=${myLang === 'en' ? 'es' : 'en'}`

  const copyLink = async () => {
    const link = getShareLink()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link:', link)
    }
  }

  const shareLink = async () => {
    const link = getShareLink()
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my VoxLink call',
          text: 'Join my video call with real-time translation!',
          url: link
        })
      } catch (err: any) {
        if (err.name !== 'AbortError') copyLink()
      }
    } else {
      copyLink()
    }
  }

  const retry = () => {
    cleanup()
    retriesRef.current = 0
    setParticipants(new Map())
    setCallDuration(0)
    setState('init')
    setTimeout(connect, 500)
  }

  const confirmEnd = () => {
    setShowEndConfirm(true)
  }

  const end = () => {
    cleanup()
    router.push('/')
  }

  // Export transcript
  const exportTranscript = () => {
    if (log.length === 0) return
    const content = log.map(e =>
      `[${e.time}] ${e.speaker} (${e.speakerLang === 'en' ? 'English' : 'Spanish'}):\n  Original: ${e.text}\n  Translation: ${e.translated}`
    ).join('\n\n')

    const blob = new Blob([`VoxLink Call Transcript\nDate: ${new Date().toLocaleDateString()}\nDuration: ${formatDuration(callDuration)}\n\n${content}`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voxlink-transcript-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Grid layout
  const participantCount = participants.size
  const gridClass = participantCount <= 1 ? 'grid-cols-1' :
                    participantCount <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                    'grid-cols-2'

  const statusColor = {
    init: 'bg-gray-400', media: 'bg-yellow-400', ready: 'bg-blue-400',
    connecting: 'bg-yellow-400 animate-pulse', connected: 'bg-green-500',
    reconnecting: 'bg-orange-500 animate-pulse', failed: 'bg-red-500'
  }[state]

  // Get language flag
  const getLangFlag = (lang: 'en' | 'es') => lang === 'en' ? '🇺🇸' : '🇪🇸'
  const getLangName = (lang: 'en' | 'es') => lang === 'en' ? 'EN' : 'ES'

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-red-500 text-white text-center py-2 text-sm font-medium z-50">
          No internet connection
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between p-2 bg-black/90 z-20 safe-area-top">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-white text-xs font-medium">{status}</span>
          {state === 'connected' && (
            <>
              <span className="text-gray-500 text-xs">•</span>
              <span className="text-gray-400 text-xs font-mono">{formatDuration(callDuration)}</span>
            </>
          )}
          {isListening && <span className="text-green-400 text-xs animate-pulse">● LIVE</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Connection quality */}
          {state === 'connected' && (
            <div className={`flex items-center gap-0.5 ${qualityColor}`} title={`Connection: ${connectionQuality}`}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`w-1 rounded-sm ${i <= qualityBars ? 'bg-current' : 'bg-gray-600'}`} style={{ height: `${i * 3 + 4}px` }} />
              ))}
            </div>
          )}

          {/* Subtitle toggle */}
          <button
            onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
            className={`px-2 py-1 rounded-full text-xs transition-all ${subtitlesEnabled ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-gray-400'}`}
            title="Toggle subtitles"
          >
            CC
          </button>

          {/* Text size */}
          <div className="relative">
            <button
              onClick={() => { setShowTextSizeMenu(!showTextSizeMenu); setShowLangMenu(false); setShowSettings(false); setShowSubtitleSettings(false) }}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-full px-2 py-1 text-white text-xs transition-all"
              title="Text Size"
            >
              Aa
            </button>
            {showTextSizeMenu && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50">
                {(['sm', 'base', 'lg', 'xl', '2xl'] as TextSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => { setTextSize(size); setShowTextSizeMenu(false) }}
                    className={`block w-full px-4 py-2 text-left hover:bg-white/10 ${textSize === size ? 'text-blue-400' : 'text-white'}`}
                  >
                    {size === 'sm' ? 'Small' : size === 'base' ? 'Normal' : size === 'lg' ? 'Large' : size === 'xl' ? 'X-Large' : 'XX-Large'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language */}
          <div className="relative">
            <button
              onClick={() => { setShowLangMenu(!showLangMenu); setShowTextSizeMenu(false); setShowSettings(false); setShowSubtitleSettings(false) }}
              className="flex items-center gap-1 bg-white/10 hover:bg-white/20 rounded-full px-2 py-1 text-white text-xs transition-all"
            >
              {getLangFlag(myLang)}
            </button>
            {showLangMenu && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50">
                <button onClick={() => changeLanguage('en')} className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-white/10 ${myLang === 'en' ? 'text-blue-400' : 'text-white'}`}>
                  🇺🇸 English
                </button>
                <button onClick={() => changeLanguage('es')} className={`flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-white/10 ${myLang === 'es' ? 'text-blue-400' : 'text-white'}`}>
                  🇪🇸 Español
                </button>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => { setShowSettings(!showSettings); setShowLangMenu(false); setShowTextSizeMenu(false); setShowSubtitleSettings(false) }}
              className="bg-white/10 hover:bg-white/20 rounded-full p-1.5 text-white transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {showSettings && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50 w-56">
                <button
                  onClick={() => { setSpeakTranslations(!speakTranslations) }}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>🔊 Read translations</span>
                  <span className={speakTranslations ? 'text-green-400' : 'text-gray-500'}>{speakTranslations ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={() => { setSoundsEnabled(!soundsEnabled) }}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>🔔 Sound effects</span>
                  <span className={soundsEnabled ? 'text-green-400' : 'text-gray-500'}>{soundsEnabled ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={() => { setLowBandwidthMode(!lowBandwidthMode) }}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>📉 Low bandwidth</span>
                  <span className={lowBandwidthMode ? 'text-green-400' : 'text-gray-500'}>{lowBandwidthMode ? 'ON' : 'OFF'}</span>
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => { setShowSubtitleSettings(true); setShowSettings(false) }}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>📺 Subtitle position</span>
                  <span className="text-gray-400">→</span>
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => { exportTranscript(); setShowSettings(false) }}
                  disabled={log.length === 0}
                  className={`flex items-center w-full px-4 py-2.5 text-sm hover:bg-white/10 ${log.length > 0 ? 'text-white' : 'text-gray-500'}`}
                >
                  <span>📄 Export transcript</span>
                </button>
              </div>
            )}
          </div>

          {/* Subtitle position settings */}
          {showSubtitleSettings && (
            <div className="absolute top-12 right-2 bg-gray-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50 w-48">
              <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
                <span className="text-white text-sm font-medium">Subtitle Position</span>
                <button onClick={() => setShowSubtitleSettings(false)} className="text-gray-400 hover:text-white">×</button>
              </div>
              {(['bottom', 'top', 'split'] as SubtitlePosition[]).map(pos => (
                <button
                  key={pos}
                  onClick={() => { setSubtitlePosition(pos); setShowSubtitleSettings(false) }}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 ${subtitlePosition === pos ? 'text-blue-400' : 'text-white'}`}
                >
                  {pos === 'bottom' ? '⬇️ Bottom' : pos === 'top' ? '⬆️ Top' : '↕️ Split (You top, Them bottom)'}
                </button>
              ))}
            </div>
          )}

          {/* Log toggle */}
          <button
            onClick={() => setShowLog(!showLog)}
            className={`px-2 py-1 rounded-full text-xs transition-all ${showLog ? 'bg-blue-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            📝
          </button>

          {/* Debug */}
          <button onClick={() => setShowDebug(!showDebug)} className="text-gray-500 text-xs hover:text-white">
            {showDebug ? '×' : '?'}
          </button>
        </div>
      </div>

      {/* Debug panel */}
      {showDebug && (
        <div className="absolute top-12 left-2 right-2 z-30 bg-black/95 rounded-lg p-2 max-h-40 overflow-y-auto text-xs font-mono">
          {logs.map((l, i) => <div key={i} className="text-green-400">{l}</div>)}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className={`flex-1 relative ${showLog ? 'md:mr-80' : ''}`}>
          {/* Video grid */}
          <div className={`absolute inset-0 grid ${gridClass} gap-1 p-1`}>
            {Array.from(participants.values()).map((p) => (
              <div key={p.id} className={`relative bg-gray-900 rounded-lg overflow-hidden ${activeSpeaker === p.name ? 'ring-2 ring-green-500' : ''}`}>
                <video
                  ref={(el) => { if (el && p.stream) el.srcObject = p.stream }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {/* Remote reaction */}
                {remoteReaction && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl animate-bounce">
                    {remoteReaction}
                  </div>
                )}
                <div className={`absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${activeSpeaker === p.name ? 'bg-green-500 text-white' : 'bg-black/60 text-white'}`}>
                  {activeSpeaker === p.name && <span className="w-2 h-2 bg-white rounded-full animate-pulse" />}
                  {getLangFlag(p.language || theirLang)} {p.name}
                  {p.isMuted && <span>🔇</span>}
                </div>
              </div>
            ))}

            {participantCount === 0 && state !== 'connected' && (
              <div className="flex flex-col items-center justify-center bg-gray-900 rounded-lg">
                <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                  {(state === 'connecting' || state === 'reconnecting') ? (
                    <div className="w-10 h-10 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin" />
                  ) : (
                    <svg className="w-10 h-10 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  )}
                </div>
                <p className="text-white">{status}</p>
                {(state === 'connecting' || state === 'reconnecting') && (
                  <p className="text-gray-500 text-xs mt-2">This may take a few seconds...</p>
                )}
              </div>
            )}
          </div>

          {/* Local video PIP */}
          <div className={`absolute top-2 right-2 w-28 h-36 md:w-36 md:h-48 rounded-xl overflow-hidden shadow-2xl border-2 ${activeSpeaker === userName ? 'border-green-500' : 'border-white/20'} z-10`}>
            <video
              ref={localVideoRef}
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
            {/* Local reaction */}
            {activeReaction && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl animate-bounce">
                {activeReaction}
              </div>
            )}
            {/* Audio level indicator */}
            {!muted && myAudioLevel > 0.1 && (
              <div className="absolute top-1 right-1 flex gap-0.5">
                {[1, 2, 3].map(i => (
                  <div key={i} className={`w-1 rounded-full ${myAudioLevel > i * 0.2 ? 'bg-green-400' : 'bg-gray-600'}`} style={{ height: `${i * 4 + 4}px` }} />
                ))}
              </div>
            )}
            <button onClick={flipCamera} className="absolute top-1 left-1 bg-black/50 hover:bg-black/70 rounded-full p-1.5 transition-all">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 px-1 py-0.5 rounded text-xs ${activeSpeaker === userName ? 'bg-green-500' : 'bg-black/60'} text-white`}>
              {activeSpeaker === userName && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
              {getLangFlag(myLang)} You {muted && '🔇'}
            </div>
          </div>

          {/* Share link panel */}
          {isHost && (state === 'ready' || state === 'media') && (
            <div className="absolute top-16 left-2 right-2 md:left-auto md:right-40 md:w-80 bg-black/90 backdrop-blur rounded-xl p-4 border border-white/10 z-10">
              <p className="text-white text-sm font-medium mb-1">Invite someone to call</p>
              <p className="text-gray-400 text-xs mb-3">They&apos;ll speak {myLang === 'en' ? 'Spanish' : 'English'}, you&apos;ll see translations</p>
              <div className="flex gap-2 mb-3">
                <input
                  readOnly
                  value={typeof window !== 'undefined' ? getShareLink() : ''}
                  className="flex-1 bg-white/10 rounded-lg px-3 py-2 text-white text-xs border border-white/10 truncate"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyLink}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
                <button
                  onClick={shareLink}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
                >
                  📤 Share
                </button>
              </div>
            </div>
          )}

          {/* ENHANCED SUBTITLE DISPLAY - Beautiful, prominent, bidirectional */}
          {subtitlesEnabled && state === 'connected' && (
            <>
              {/* My subtitle - what I said (shown based on position setting) */}
              {(subtitlePosition === 'top' || subtitlePosition === 'split') && mySubtitle && (
                <div className="absolute top-16 left-2 right-2 md:left-4 md:right-4 z-10 pointer-events-none animate-fadeIn">
                  <div className="bg-gradient-to-r from-blue-600/95 to-blue-500/95 backdrop-blur-sm rounded-2xl px-5 py-4 max-w-2xl mx-auto shadow-2xl shadow-blue-500/20 border border-blue-400/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-200 text-sm font-medium">{getLangFlag(mySubtitle.speakerLang)} You said:</span>
                    </div>
                    <p className={`text-white font-semibold ${textSizeClass} leading-relaxed`}>
                      {mySubtitle.original}
                    </p>
                    <div className="mt-3 pt-3 border-t border-blue-400/30">
                      <p className="text-blue-100 text-sm mb-1">Translation for them ({getLangFlag(mySubtitle.speakerLang === 'en' ? 'es' : 'en')}):</p>
                      <p className={`text-white/90 ${textSizeSubClass} leading-relaxed`}>
                        {mySubtitle.translated}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Their subtitle - what they said (always shown at bottom or based on position) */}
              {theirSubtitle && (
                <div className={`absolute ${subtitlePosition === 'split' || subtitlePosition === 'bottom' ? 'bottom-24' : 'top-16'} left-2 right-2 md:left-4 md:right-4 z-10 pointer-events-none animate-fadeIn`}>
                  <div className="bg-gradient-to-r from-emerald-600/95 to-green-500/95 backdrop-blur-sm rounded-2xl px-5 py-4 max-w-2xl mx-auto shadow-2xl shadow-green-500/20 border border-green-400/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-green-200 text-sm font-medium">{getLangFlag(theirSubtitle.speakerLang)} {theirSubtitle.speaker} said:</span>
                    </div>
                    <p className={`text-white/80 ${textSizeSubClass} leading-relaxed`}>
                      {theirSubtitle.original}
                    </p>
                    <div className="mt-3 pt-3 border-t border-green-400/30">
                      <p className="text-green-100 text-sm mb-1">Translation for you ({getLangFlag(myLang)}):</p>
                      <p className={`text-white font-semibold ${textSizeClass} leading-relaxed`}>
                        {theirSubtitle.translated}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Live typing indicator */}
              {liveText && (
                <div className="absolute bottom-44 left-2 right-2 z-10 pointer-events-none">
                  <div className="bg-blue-500/80 backdrop-blur rounded-xl px-4 py-3 max-w-md mx-auto">
                    <p className={`text-white ${textSizeSubClass}`}>{liveText}</p>
                    <p className="text-blue-200 text-xs mt-1 flex items-center gap-1">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      You&apos;re speaking...
                    </p>
                  </div>
                </div>
              )}

              {/* Show my subtitle at bottom when position is 'bottom' */}
              {subtitlePosition === 'bottom' && mySubtitle && !theirSubtitle && (
                <div className="absolute bottom-24 left-2 right-2 md:left-4 md:right-4 z-10 pointer-events-none animate-fadeIn">
                  <div className="bg-gradient-to-r from-blue-600/95 to-blue-500/95 backdrop-blur-sm rounded-2xl px-5 py-4 max-w-2xl mx-auto shadow-2xl shadow-blue-500/20 border border-blue-400/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-blue-200 text-sm font-medium">{getLangFlag(mySubtitle.speakerLang)} You said:</span>
                    </div>
                    <p className={`text-white font-semibold ${textSizeClass} leading-relaxed`}>
                      {mySubtitle.original}
                    </p>
                    <div className="mt-3 pt-3 border-t border-blue-400/30">
                      <p className="text-blue-100 text-sm mb-1">Translation for them ({getLangFlag(mySubtitle.speakerLang === 'en' ? 'es' : 'en')}):</p>
                      <p className={`text-white/90 ${textSizeSubClass} leading-relaxed`}>
                        {mySubtitle.translated}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Failed/Reconnecting overlay */}
          {(state === 'failed' || state === 'reconnecting') && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur flex flex-col items-center justify-center z-20">
              {state === 'reconnecting' ? (
                <>
                  <div className="w-16 h-16 border-4 border-white/20 border-t-orange-500 rounded-full animate-spin mb-4" />
                  <p className="text-white text-xl font-medium mb-2">Reconnecting...</p>
                  <p className="text-gray-400 text-sm">Please wait</p>
                </>
              ) : (
                <>
                  <p className="text-white text-xl font-medium mb-2">{status}</p>
                  <p className="text-gray-400 text-sm mb-4">Make sure the host has started the call</p>
                  <button onClick={retry} className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200">
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Conversation log panel */}
        {showLog && (
          <div className="hidden md:flex flex-col w-80 bg-gray-900 border-l border-white/10">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium">Conversation Log</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`text-xs px-2 py-1 rounded ${autoScroll ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-gray-400'}`}
                  title="Auto-scroll"
                >
                  ↓
                </button>
                <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-white">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {log.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">Conversation will appear here</p>
              )}
              {log.map((entry) => (
                <div key={entry.id} className={`rounded-lg p-3 ${entry.isRemote ? 'bg-green-500/10 border border-green-500/20' : 'bg-blue-500/10 border border-blue-500/20'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${textSizeSubClass} ${entry.isRemote ? 'text-green-400' : 'text-blue-400'}`}>
                      {getLangFlag(entry.speakerLang)} {entry.speaker}
                    </span>
                    <span className="text-gray-500 text-xs">{entry.time}</span>
                  </div>
                  <p className={`text-white ${textSizeClass}`}>{entry.text}</p>
                  <p className={`text-gray-400 ${textSizeSubClass} mt-1`}>→ {entry.translated}</p>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Mobile log */}
      {showLog && (
        <div className="md:hidden fixed inset-x-0 bottom-24 top-1/2 bg-gray-900 rounded-t-2xl border-t border-white/10 z-20 flex flex-col">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-white font-medium">Conversation Log</h3>
            <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-white">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {log.map((entry) => (
              <div key={entry.id} className={`rounded-lg p-2 ${entry.isRemote ? 'bg-green-500/10' : 'bg-blue-500/10'}`}>
                <span className={`font-medium text-xs ${entry.isRemote ? 'text-green-400' : 'text-blue-400'}`}>
                  {getLangFlag(entry.speakerLang)} {entry.speaker}
                </span>
                <p className={`text-white ${textSizeClass}`}>{entry.text}</p>
                <p className={`text-gray-400 ${textSizeSubClass}`}>→ {entry.translated}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End call confirmation */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-2xl p-6 mx-4 max-w-sm w-full border border-white/10">
            <h3 className="text-white text-lg font-semibold mb-2">End call?</h3>
            <p className="text-gray-400 text-sm mb-6">Are you sure you want to leave this call?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={end}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600"
              >
                End Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactions panel */}
      {showReactions && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur rounded-2xl p-3 border border-white/10 z-30 flex gap-2">
          {['👍', '❤️', '😂', '👏', '🎉', '🤔'].map(emoji => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="w-12 h-12 text-2xl hover:bg-white/10 rounded-xl transition-all hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Bottom controls */}
      <div className="p-4 bg-black/90 z-20 safe-area-bottom">
        <div className="flex justify-center items-center gap-3">
          {/* Reactions */}
          <button
            onClick={() => setShowReactions(!showReactions)}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${showReactions ? 'bg-yellow-500' : 'bg-white/10 hover:bg-white/20'}`}
            title="Reactions"
          >
            <span className="text-xl">😊</span>
          </button>

          {isHost && participants.size < 3 && (
            <button
              onClick={shareLink}
              className="w-11 h-11 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-all"
              title="Invite"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </button>
          )}

          <button onClick={flipCamera} className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" title="Flip">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${muted ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}>
            {muted ? (
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            ) : (
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            )}
          </button>

          <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${videoOff ? 'bg-red-500' : 'bg-white/10 hover:bg-white/20'}`}>
            {videoOff ? (
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          <button onClick={confirmEnd} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-2">
          {isHost ? 'Host' : 'Guest'} • {getLangFlag(myLang)} {getLangName(myLang)} → {getLangFlag(theirLang)} {getLangName(theirLang)} • {participantCount + 1} in call
        </p>
      </div>

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .safe-area-top {
          padding-top: max(0.5rem, env(safe-area-inset-top));
        }
        .safe-area-bottom {
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  )
}
