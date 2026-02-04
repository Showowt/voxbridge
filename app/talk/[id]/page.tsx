'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

const cache = new Map<string, string>()

interface Message {
  id: string
  sender: string
  original: string
  translated: string
  fromLang: 'en' | 'es'
  toLang: 'en' | 'es'
  timestamp: number
}

type TextSize = 'sm' | 'base' | 'lg' | 'xl' | '2xl'

export default function ConnectedTalk() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || (isHost ? 'You' : 'Partner')
  const initialLang = (searchParams.get('lang') as 'en' | 'es') || 'en'

  // Connection state
  const [state, setState] = useState<'init' | 'connecting' | 'connected' | 'failed'>('init')
  const [status, setStatus] = useState('Connecting...')
  const [partnerName, setPartnerName] = useState('Partner')
  const [partnerConnected, setPartnerConnected] = useState(false)
  const [partnerLang, setPartnerLang] = useState<'en' | 'es'>(initialLang === 'en' ? 'es' : 'en')

  // Language
  const [myLang, setMyLang] = useState<'en' | 'es'>(initialLang)

  // Messages
  const [messages, setMessages] = useState<Message[]>([])
  const [liveText, setLiveText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [partnerSpeaking, setPartnerSpeaking] = useState(false)

  // UI Settings
  const [textSize, setTextSize] = useState<TextSize>('lg')
  const [showSettings, setShowSettings] = useState(false)
  const [speakTranslations, setSpeakTranslations] = useState(false)
  const [soundsEnabled, setSoundsEnabled] = useState(true)

  // Share
  const [copied, setCopied] = useState(false)

  // Refs
  const peerRef = useRef<any>(null)
  const connRef = useRef<any>(null)
  const recRef = useRef<any>(null)
  const mountedRef = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const langRef = useRef(myLang)

  useEffect(() => { langRef.current = myLang }, [myLang])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
      utterance.rate = 1.0
      utterance.volume = 0.9
      speechSynthesis.speak(utterance)
    } catch (e) {}
  }, [speakTranslations])

  // Vibrate on events (mobile)
  const vibrate = useCallback((pattern: number | number[]) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern) } catch {}
    }
  }, [])

  // Translation
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim() || from === to) return text
    const key = `${from}>${to}:${text.trim().toLowerCase()}`
    if (cache.has(key)) return cache.get(key)!
    try {
      // Use local API
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
      // Fallback
      try {
        const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`)
        const d = await r.json()
        const t = d.responseData?.translatedText || text
        cache.set(key, t)
        return t
      } catch { return text }
    }
  }, [])

  // Send message to partner
  const sendToPartner = useCallback((data: any) => {
    if (connRef.current?.open) {
      try { connRef.current.send(JSON.stringify(data)) } catch {}
    }
  }, [])

  // Handle speech result
  const onSpeech = useCallback(async (text: string) => {
    if (!text.trim()) return
    const currentLang = langRef.current
    const targetLang = currentLang === 'en' ? 'es' : 'en'
    const translated = await translate(text, currentLang, targetLang)

    const msg: Message = {
      id: Date.now().toString(),
      sender: userName,
      original: text,
      translated,
      fromLang: currentLang,
      toLang: targetLang,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, msg])
    sendToPartner({ type: 'message', ...msg })
  }, [userName, translate, sendToPartner])

  // Speech recognition
  const setupSpeech = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current === 'en' ? 'en-US' : 'es-ES'

    rec.onstart = () => {
      setIsListening(true)
      setIsSpeaking(true)
      sendToPartner({ type: 'speaking', speaking: true })
    }
    rec.onend = () => {
      setIsListening(false)
      setIsSpeaking(false)
      setLiveText('')
      sendToPartner({ type: 'speaking', speaking: false })
    }
    rec.onerror = () => {
      setIsListening(false)
      setIsSpeaking(false)
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
  }, [onSpeech, sendToPartner])

  const startListening = useCallback(() => {
    if (!recRef.current) setupSpeech()
    try { recRef.current?.start() } catch {}
  }, [setupSpeech])

  const stopListening = useCallback(() => {
    try { recRef.current?.stop() } catch {}
    setIsListening(false)
    setIsSpeaking(false)
    setLiveText('')
  }, [])

  // Setup connection
  const setupConnection = useCallback((conn: any) => {
    connRef.current = conn

    conn.on('open', () => {
      setPartnerConnected(true)
      setState('connected')
      setStatus('Connected!')
      playSound('join')
      vibrate([50, 50, 50])
      conn.send(JSON.stringify({ type: 'join', name: userName, lang: myLang }))
    })

    conn.on('data', (d: string) => {
      try {
        const msg = JSON.parse(d)
        if (msg.type === 'join') {
          setPartnerName(msg.name || 'Partner')
          setPartnerLang(msg.lang)
        } else if (msg.type === 'message') {
          // Received message from partner - show their original and translation
          const received: Message = {
            id: msg.id,
            sender: msg.sender,
            original: msg.original,
            translated: msg.translated,
            fromLang: msg.fromLang,
            toLang: msg.toLang,
            timestamp: msg.timestamp
          }
          setMessages(prev => [...prev, received])
          playSound('message')
          vibrate(50)
          // Speak the translation (which is in my language)
          speakText(msg.translated, langRef.current)
        } else if (msg.type === 'speaking') {
          setPartnerSpeaking(msg.speaking)
        } else if (msg.type === 'lang') {
          setPartnerLang(msg.lang)
        }
      } catch {}
    })

    conn.on('close', () => {
      setPartnerConnected(false)
      setStatus('Partner disconnected')
      playSound('leave')
    })
  }, [userName, myLang, playSound, vibrate, speakText])

  // Connect via PeerJS
  const connect = useCallback(async () => {
    try {
      setState('connecting')
      setStatus(isHost ? 'Creating room...' : 'Joining...')

      const Peer = (await import('peerjs')).default
      const peerId = isHost ? `talk-${roomId}` : `talk-${roomId}-${Date.now()}`

      const peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:a.relay.metered.ca:80', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
            { urls: 'turn:a.relay.metered.ca:443', username: 'e8dd65b92ed50f3a0f709341', credential: 'uWdWNmkhvyqTmFGo' },
          ]
        }
      })

      peerRef.current = peer

      peer.on('open', () => {
        if (isHost) {
          setStatus('Waiting for partner...')
        } else {
          setStatus('Connecting to partner...')
          const conn = peer.connect(`talk-${roomId}`, { reliable: true })
          setupConnection(conn)
        }
      })

      peer.on('connection', (conn) => {
        setupConnection(conn)
      })

      peer.on('error', (err: any) => {
        if (err.type === 'peer-unavailable') {
          setStatus('Room not found')
          setState('failed')
        }
      })
    } catch (err: any) {
      setState('failed')
      setStatus(`Error: ${err.message}`)
    }
  }, [isHost, roomId, setupConnection])

  useEffect(() => {
    mountedRef.current = true
    setupSpeech()
    connect()
    return () => {
      mountedRef.current = false
      try { recRef.current?.stop() } catch {}
      try { connRef.current?.close() } catch {}
      try { peerRef.current?.destroy() } catch {}
    }
  }, [])

  const getShareLink = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/talk/${roomId}?host=false&lang=${myLang === 'en' ? 'es' : 'en'}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(getShareLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt('Copy this link:', getShareLink())
    }
  }

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my VoxLink chat',
          text: 'Chat with me with real-time translation!',
          url: getShareLink()
        })
      } catch (err: any) {
        if (err.name !== 'AbortError') copyLink()
      }
    } else {
      copyLink()
    }
  }

  const goHome = () => {
    try { recRef.current?.stop() } catch {}
    try { connRef.current?.close() } catch {}
    try { peerRef.current?.destroy() } catch {}
    router.push('/')
  }

  const retry = () => {
    try { connRef.current?.close() } catch {}
    try { peerRef.current?.destroy() } catch {}
    setMessages([])
    setState('init')
    setTimeout(connect, 500)
  }

  // Export transcript
  const exportTranscript = () => {
    if (messages.length === 0) return
    const content = messages.map(m =>
      `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.sender} (${m.fromLang === 'en' ? 'English' : 'Spanish'}):\n  Original: ${m.original}\n  Translation: ${m.translated}`
    ).join('\n\n')

    const blob = new Blob([`VoxLink Chat Transcript\nDate: ${new Date().toLocaleDateString()}\n\n${content}`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `voxlink-chat-${new Date().toISOString().split('T')[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Determine if message is from me
  const isMyMessage = (msg: Message) => msg.sender === userName

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

  // Get language flag
  const getLangFlag = (lang: 'en' | 'es') => lang === 'en' ? '🇺🇸' : '🇪🇸'

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10 bg-black/30 backdrop-blur safe-area-top">
        <button onClick={goHome} className="text-white/70 hover:text-white p-2 -ml-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        <div className="text-center">
          <h1 className="text-white font-semibold">Live Translation</h1>
          <div className="flex items-center justify-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${state === 'connected' ? 'bg-green-500' : state === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-white/60">{status}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-lg">{getLangFlag(myLang)}</span>

          {/* Settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {showSettings && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 rounded-lg shadow-xl border border-white/10 overflow-hidden z-50 w-56">
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-white text-sm font-medium mb-2">Text Size</p>
                  <div className="flex gap-1">
                    {(['sm', 'base', 'lg', 'xl', '2xl'] as TextSize[]).map(size => (
                      <button
                        key={size}
                        onClick={() => setTextSize(size)}
                        className={`flex-1 py-1 rounded text-xs ${textSize === size ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'}`}
                      >
                        {size === 'sm' ? 'S' : size === 'base' ? 'M' : size === 'lg' ? 'L' : size === 'xl' ? 'XL' : '2X'}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setSpeakTranslations(!speakTranslations)}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>🔊 Read translations</span>
                  <span className={speakTranslations ? 'text-green-400' : 'text-gray-500'}>{speakTranslations ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  onClick={() => setSoundsEnabled(!soundsEnabled)}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-white hover:bg-white/10"
                >
                  <span>🔔 Sound effects</span>
                  <span className={soundsEnabled ? 'text-green-400' : 'text-gray-500'}>{soundsEnabled ? 'ON' : 'OFF'}</span>
                </button>
                <div className="border-t border-white/10" />
                <button
                  onClick={() => { exportTranscript(); setShowSettings(false) }}
                  disabled={messages.length === 0}
                  className={`flex items-center w-full px-4 py-2.5 text-sm hover:bg-white/10 ${messages.length > 0 ? 'text-white' : 'text-gray-500'}`}
                >
                  <span>📄 Export transcript</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share panel - shown when waiting for partner */}
      {isHost && !partnerConnected && state !== 'failed' && (
        <div className="mx-4 mt-4 bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10">
          <p className="text-white font-medium mb-1">Share with your partner</p>
          <p className="text-white/60 text-sm mb-3">They&apos;ll see your messages translated to {myLang === 'en' ? 'Spanish' : 'English'}</p>

          <div className="bg-black/30 rounded-xl px-3 py-2 mb-3 overflow-hidden">
            <p className="text-white/80 text-xs truncate">{typeof window !== 'undefined' ? getShareLink() : ''}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {copied ? (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={shareLink}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && partnerConnected && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-white text-2xl font-semibold mb-2">Connected with {partnerName}</h2>
            <p className="text-white/50 text-base max-w-xs mb-2">
              {getLangFlag(partnerLang)} They speak {partnerLang === 'en' ? 'English' : 'Spanish'}
            </p>
            <p className="text-white/40 text-sm max-w-xs">
              Hold the microphone button to speak. Your partner will see the translation instantly.
            </p>
          </div>
        )}

        {messages.length === 0 && !partnerConnected && state !== 'failed' && !isHost && (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="text-white/60">Connecting...</p>
          </div>
        )}

        {/* Message list */}
        <div className="space-y-4">
          {messages.map((msg) => {
            const isMine = isMyMessage(msg)
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                <div className={`max-w-[85%] ${isMine ? 'items-end' : 'items-start'}`}>
                  {/* Sender name with flag */}
                  <p className={`text-xs text-white/40 mb-1 ${isMine ? 'text-right' : 'text-left'} flex items-center gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {getLangFlag(msg.fromLang)} {isMine ? 'You' : partnerName}
                  </p>

                  {/* Message bubble - ENHANCED with prominent translation */}
                  <div className={`rounded-2xl overflow-hidden shadow-lg ${
                    isMine
                      ? 'bg-gradient-to-br from-blue-600 to-blue-500 rounded-br-md'
                      : 'bg-gradient-to-br from-emerald-600 to-green-500 rounded-bl-md'
                  }`}>
                    {/* Original text (what they said in their language) */}
                    <div className={`px-4 pt-3 pb-2 ${isMine ? 'bg-blue-700/30' : 'bg-emerald-700/30'}`}>
                      <p className={`${textSizeSubClass} ${isMine ? 'text-blue-100' : 'text-green-100'}`}>
                        {msg.original}
                      </p>
                    </div>

                    {/* Translated text (prominent, larger) */}
                    <div className="px-4 py-3">
                      <p className={`text-xs mb-1 ${isMine ? 'text-blue-200' : 'text-green-200'}`}>
                        {getLangFlag(msg.toLang)} Translation:
                      </p>
                      <p className={`font-semibold text-white ${textSizeClass}`}>
                        {msg.translated}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Partner speaking indicator */}
          {partnerSpeaking && (
            <div className="flex justify-start animate-fadeIn">
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-2xl rounded-bl-md px-4 py-3">
                <p className="text-emerald-400 text-sm flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  {partnerName} is speaking...
                </p>
              </div>
            </div>
          )}

          {/* Live typing indicator */}
          {liveText && (
            <div className="flex justify-end animate-fadeIn">
              <div className="max-w-[85%]">
                <p className="text-xs text-white/40 mb-1 text-right flex items-center gap-1 justify-end">
                  {getLangFlag(myLang)} You
                </p>
                <div className="bg-blue-500/50 backdrop-blur rounded-2xl rounded-br-md px-4 py-3 border border-blue-400/30">
                  <p className={`text-white ${textSizeSubClass}`}>{liveText}</p>
                  <p className="text-xs text-blue-200 mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    Listening...
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Failed state */}
      {state === 'failed' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur flex flex-col items-center justify-center z-20">
          <p className="text-white text-xl font-medium mb-4">{status}</p>
          <button onClick={retry} className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200">
            Try Again
          </button>
        </div>
      )}

      {/* Bottom - Push to talk */}
      <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent safe-area-bottom">
        {partnerConnected ? (
          <div className="flex flex-col items-center">
            {/* Large microphone button */}
            <button
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                isListening
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50 scale-110'
                  : 'bg-white/10 hover:bg-white/20 border-2 border-white/20'
              }`}
            >
              <svg className={`w-12 h-12 ${isListening ? 'text-white' : 'text-white/80'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            </button>

            <p className="text-white/50 text-sm mt-4">
              {isListening ? 'Release to send' : 'Hold to speak'}
            </p>

            <p className="text-white/30 text-xs mt-2 flex items-center gap-2">
              {getLangFlag(myLang)} {myLang === 'en' ? 'English' : 'Spanish'} → {getLangFlag(myLang === 'en' ? 'es' : 'en')} {myLang === 'en' ? 'Spanish' : 'English'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-white/50">Waiting for partner to connect...</p>
          </div>
        )}
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
          padding-top: max(1rem, env(safe-area-inset-top));
        }
        .safe-area-bottom {
          padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  )
}
