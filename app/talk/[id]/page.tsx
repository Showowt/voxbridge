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

  // Language
  const [myLang, setMyLang] = useState<'en' | 'es'>(initialLang)
  const theirLang = myLang === 'en' ? 'es' : 'en'

  // Messages
  const [messages, setMessages] = useState<Message[]>([])
  const [liveText, setLiveText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

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

  // Translation
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim() || from === to) return text
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
      conn.send(JSON.stringify({ type: 'join', name: userName, lang: myLang }))
    })

    conn.on('data', (d: string) => {
      try {
        const msg = JSON.parse(d)
        if (msg.type === 'join') {
          setPartnerName(msg.name || 'Partner')
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
        } else if (msg.type === 'speaking') {
          // Partner is speaking - could show indicator
        }
      } catch {}
    })

    conn.on('close', () => {
      setPartnerConnected(false)
      setStatus('Partner disconnected')
    })
  }, [userName, myLang])

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

  const getShareLink = () => `${typeof window !== 'undefined' ? window.location.origin : ''}/talk/${roomId}?host=false&lang=${theirLang}`

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
          title: 'Join my VoxBridge chat',
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

  // Determine if message is from me
  const isMyMessage = (msg: Message) => msg.sender === userName

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10 bg-black/30 backdrop-blur">
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

        <div className="flex items-center gap-1">
          <span className="text-lg">{myLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
        </div>
      </div>

      {/* Share panel - shown when waiting for partner */}
      {isHost && !partnerConnected && state !== 'failed' && (
        <div className="mx-4 mt-4 bg-white/5 backdrop-blur rounded-2xl p-4 border border-white/10">
          <p className="text-white font-medium mb-1">Share with your partner</p>
          <p className="text-white/60 text-sm mb-3">They'll see your messages translated to {theirLang === 'en' ? 'English' : 'Spanish'}</p>

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
            <p className="text-white/50 text-base max-w-xs">
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
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${isMine ? 'items-end' : 'items-start'}`}>
                  {/* Sender name */}
                  <p className={`text-xs text-white/40 mb-1 ${isMine ? 'text-right' : 'text-left'}`}>
                    {isMine ? 'You' : partnerName}
                  </p>

                  {/* Message bubble */}
                  <div className={`rounded-2xl overflow-hidden ${
                    isMine
                      ? 'bg-blue-500 rounded-br-md'
                      : 'bg-white/10 rounded-bl-md'
                  }`}>
                    {/* Original text (smaller, at top) */}
                    <div className={`px-4 pt-3 pb-2 ${isMine ? 'bg-blue-600/50' : 'bg-white/5'}`}>
                      <p className={`text-sm ${isMine ? 'text-blue-100' : 'text-white/60'}`}>
                        {msg.fromLang === 'en' ? '🇺🇸' : '🇪🇸'} {msg.original}
                      </p>
                    </div>

                    {/* Translated text (larger, prominent) */}
                    <div className="px-4 py-3">
                      <p className={`text-xl font-medium ${isMine ? 'text-white' : 'text-white'}`}>
                        {msg.toLang === 'en' ? '🇺🇸' : '🇪🇸'} {msg.translated}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Live typing indicator */}
          {liveText && (
            <div className="flex justify-end">
              <div className="max-w-[85%]">
                <p className="text-xs text-white/40 mb-1 text-right">You</p>
                <div className="bg-blue-500/50 rounded-2xl rounded-br-md px-4 py-3">
                  <p className="text-white">{liveText}</p>
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
      <div className="p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
        {partnerConnected ? (
          <div className="flex flex-col items-center">
            {/* Large microphone button */}
            <button
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                isListening
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/50 scale-110'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              <svg className={`w-10 h-10 ${isListening ? 'text-white' : 'text-white/80'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            </button>

            <p className="text-white/50 text-sm mt-4">
              {isListening ? 'Release to send' : 'Hold to speak'}
            </p>

            <p className="text-white/30 text-xs mt-2">
              Speaking {myLang === 'en' ? 'English' : 'Spanish'} → {theirLang === 'en' ? 'English' : 'Spanish'}
            </p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-white/50">Waiting for partner to connect...</p>
          </div>
        )}
      </div>
    </div>
  )
}
