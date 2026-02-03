'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Peer, { DataConnection } from 'peerjs'

/**
 * MACHINEMIND VOXLINK™ FACE-TO-FACE MODE v3.0
 * 
 * SEAMLESS JOIN + BULLETPROOF REAL-TIME TRANSLATION
 * - In-page join form when accessed via shared link
 * - Works worldwide on any device
 * - Automatic reconnection
 * - Connection health monitoring
 * - Multiple ICE servers for NAT traversal
 * - Mobile-optimized UI
 * 
 * Person A speaks English → Person B sees large Spanish translation
 * Person B speaks Spanish → Person A sees large English translation
 */

type Lang = 'en' | 'es'

interface Message {
  id: string
  speaker: string
  speakerLang: Lang
  original: string
  translated: string
  isFromMe: boolean
  time: number
}

// Translation with retry
async function translate(text: string, from: Lang, to: Lang): Promise<string> {
  if (from === to || !text.trim()) return text
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
      })
      const data = await res.json()
      if (data.translation) return data.translation
    } catch (e) {
      console.error('[TRANSLATE] Attempt', attempt + 1, 'failed:', e)
      if (attempt < 2) await new Promise(r => setTimeout(r, 500))
    }
  }
  return text // Return original if all attempts fail
}

// Join Form Component
function JoinForm({ callId, onJoin }: { callId: string, onJoin: (name: string, lang: Lang) => void }) {
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<Lang>('en')
  
  useEffect(() => {
    const savedName = localStorage.getItem('voxlink_name')
    const savedLang = localStorage.getItem('voxlink_lang') as Lang
    if (savedName) setName(savedName)
    if (savedLang) setLanguage(savedLang)
  }, [])
  
  const handleJoin = () => {
    if (!name.trim()) {
      alert('Please enter your name / Por favor ingresa tu nombre')
      return
    }
    localStorage.setItem('voxlink_name', name)
    localStorage.setItem('voxlink_lang', language)
    onJoin(name.trim(), language)
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-3">
            <span className="text-3xl">💬</span>
          </div>
          <div className="text-sm font-medium text-cyan-400 mb-1">MACHINEMIND</div>
          <h1 className="text-2xl font-bold text-white mb-1">Join Conversation</h1>
          <p className="text-gray-400 text-sm">Face-to-Face Translation</p>
        </div>

        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
          <div className="text-center mb-6">
            <p className="text-sm text-gray-500 mb-2">Joining Room / Unirse a la sala</p>
            <p className="text-3xl font-mono font-bold text-cyan-400 tracking-widest">{callId.toUpperCase()}</p>
          </div>

          <div className="mb-5">
            <label className="block text-sm text-gray-400 mb-2">Your Name / Tu Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name / Ingresa tu nombre"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              className="w-full px-4 py-4 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition text-lg text-center"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2 text-center">I speak / Yo hablo</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLanguage('en')}
                className={`p-4 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 ${
                  language === 'en'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-gray-700 bg-[#1a1a2e] text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="text-3xl">🇺🇸</span>
                <span className="font-medium">English</span>
              </button>
              <button
                onClick={() => setLanguage('es')}
                className={`p-4 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 ${
                  language === 'es'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                    : 'border-gray-700 bg-[#1a1a2e] text-gray-400 hover:border-gray-600'
                }`}
              >
                <span className="text-3xl">🇪🇸</span>
                <span className="font-medium">Español</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleJoin}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
          >
            <span>💬</span>
            <span>Join / Unirse</span>
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          Works on any device • Funciona en cualquier dispositivo
        </p>
        <div className="text-center mt-4">
          <a href="https://machinemindconsulting.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 hover:text-cyan-400 transition">
            Powered by <span className="text-cyan-500">MachineMind</span>
          </a>
        </div>
      </div>
    </div>
  )
}

function TalkModeContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const callId = params.id as string
  const urlName = searchParams.get('name')
  const urlLang = searchParams.get('lang') as Lang
  const urlHost = searchParams.get('host')
  
  const [joinedName, setJoinedName] = useState<string | null>(urlName ? decodeURIComponent(urlName) : null)
  const [joinedLang, setJoinedLang] = useState<Lang>(urlLang || 'en')
  const [isHost, setIsHost] = useState(urlHost === 'true')
  
  const handleJoin = (name: string, lang: Lang) => {
    setJoinedName(name)
    setJoinedLang(lang)
    setIsHost(false)
  }
  
  if (!joinedName) {
    return <JoinForm callId={callId} onJoin={handleJoin} />
  }
  
  return <TalkModeMain callId={callId} myName={joinedName} myLang={joinedLang} isHost={isHost} />
}

function TalkModeMain({ callId, myName, myLang, isHost }: { callId: string, myName: string, myLang: Lang, isHost: boolean }) {
  const router = useRouter()

  // State
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'error'>('connecting')
  const [error, setError] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [partnerLang, setPartnerLang] = useState<Lang>(myLang === 'en' ? 'es' : 'en')
  const [messages, setMessages] = useState<Message[]>([])
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [connectionHealth, setConnectionHealth] = useState<'good' | 'poor' | 'disconnected'>('disconnected')
  const [lastPing, setLastPing] = useState<number>(0)

  // Refs for stable callback access
  const peerRef = useRef<Peer | null>(null)
  const dataConnRef = useRef<DataConnection | null>(null)
  const speechRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const listeningRef = useRef(true)
  const myNameRef = useRef(myName)
  const myLangRef = useRef(myLang)
  const reconnectAttempts = useRef(0)
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastPongRef = useRef<number>(Date.now())

  // Keep refs in sync
  useEffect(() => { listeningRef.current = listening }, [listening])
  useEffect(() => { myNameRef.current = myName }, [myName])
  useEffect(() => { myLangRef.current = myLang }, [myLang])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Add message
  const addMessage = useCallback(async (
    speaker: string, 
    speakerLang: Lang, 
    text: string, 
    isFromMe: boolean
  ) => {
    if (!text.trim()) return
    console.log('[MSG] Adding:', { speaker, speakerLang, text, isFromMe })
    
    const targetLang: Lang = speakerLang === 'en' ? 'es' : 'en'
    const translated = await translate(text, speakerLang, targetLang)
    
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      speaker,
      speakerLang,
      original: text,
      translated,
      isFromMe,
      time: Date.now()
    }])
  }, [])

  // Send data to partner
  const send = useCallback((data: any) => {
    const conn = dataConnRef.current
    if (conn?.open) {
      try { 
        conn.send(data)
        if (data.type !== 'ping' && data.type !== 'pong') {
          console.log('[SEND]', data.type)
        }
        return true
      } catch (e) {
        console.error('[SEND] Failed:', e)
        return false
      }
    }
    console.warn('[SEND] No open connection')
    return false
  }, [])

  // Handle incoming data
  const handleData = useCallback((data: any) => {
    if (data.type === 'ping') {
      send({ type: 'pong', time: data.time })
      return
    }
    
    if (data.type === 'pong') {
      const latency = Date.now() - data.time
      setLastPing(latency)
      lastPongRef.current = Date.now()
      setConnectionHealth(latency < 500 ? 'good' : 'poor')
      return
    }
    
    console.log('[DATA] Received:', data.type)
    
    if (data.type === 'identity') {
      console.log('[DATA] Partner:', data.name, data.lang)
      setPartnerName(data.name)
      setPartnerLang(data.lang)
      setStatus('connected')
      setConnectionHealth('good')
      reconnectAttempts.current = 0
    } else if (data.type === 'speech' && data.text) {
      console.log('[DATA] Speech:', data.text)
      addMessage(data.name, data.lang, data.text, false)
    }
  }, [addMessage, send])

  // Setup speech recognition
  const setupSpeech = useCallback(() => {
    if (typeof window === 'undefined') return null

    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) {
      console.error('[SPEECH] Not supported')
      setError('Speech recognition not supported. Please use Chrome, Edge, or Safari.')
      return null
    }

    console.log('[SPEECH] Setting up for:', myLangRef.current)

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    
    // Set language based on user selection
    if (myLangRef.current === 'es') {
      recognition.lang = 'es-ES'
    } else {
      recognition.lang = 'en-US'
    }

    recognition.onstart = () => {
      console.log('[SPEECH] Started')
    }

    recognition.onresult = (e: any) => {
      let interimText = ''
      let finalText = ''
      
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalText += transcript
        } else {
          interimText += transcript
        }
      }

      setInterim(interimText)

      if (finalText.trim()) {
        console.log('[SPEECH] Final:', finalText.trim())
        setInterim('')
        
        const text = finalText.trim()
        const name = myNameRef.current
        const lang = myLangRef.current
        
        // Add locally
        addMessage(name, lang, text, true)
        
        // Send to partner
        send({ type: 'speech', name, lang, text })
      }
    }

    recognition.onerror = (e: any) => {
      console.error('[SPEECH] Error:', e.error)
      
      // Auto-restart on recoverable errors
      if (e.error === 'network' || e.error === 'audio-capture' || e.error === 'not-allowed') {
        if (e.error === 'not-allowed') {
          setError('Microphone access denied. Please allow microphone access and refresh.')
        }
      }
      
      // Restart after brief delay
      if (e.error !== 'not-allowed' && e.error !== 'aborted') {
        setTimeout(() => {
          if (listeningRef.current && mountedRef.current && speechRef.current === recognition) {
            try { recognition.start() } catch {}
          }
        }, 1000)
      }
    }

    recognition.onend = () => {
      console.log('[SPEECH] Ended')
      
      // Auto-restart if still listening
      if (listeningRef.current && mountedRef.current && speechRef.current === recognition) {
        setTimeout(() => {
          try { 
            recognition.start()
            console.log('[SPEECH] Restarted')
          } catch (e) {
            console.error('[SPEECH] Restart failed:', e)
          }
        }, 100)
      }
    }

    return recognition
  }, [addMessage, send])

  // Start speech recognition
  const startSpeech = useCallback(() => {
    if (speechRef.current) {
      try { speechRef.current.stop() } catch {}
    }
    
    const recognition = setupSpeech()
    if (recognition) {
      speechRef.current = recognition
      try {
        recognition.start()
        console.log('[SPEECH] Started successfully')
      } catch (e) {
        console.error('[SPEECH] Start failed:', e)
      }
    }
  }, [setupSpeech])

  // Setup data connection
  const setupConnection = useCallback((conn: DataConnection) => {
    console.log('[CONN] Setting up with:', conn.peer)
    
    conn.on('open', () => {
      console.log('[CONN] OPEN')
      dataConnRef.current = conn
      
      // Send identity
      const identity = { type: 'identity', name: myNameRef.current, lang: myLangRef.current }
      console.log('[CONN] Sending identity:', identity)
      conn.send(identity)
      
      setStatus('connected')
      setConnectionHealth('good')
      reconnectAttempts.current = 0
      
      // Start ping interval
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = setInterval(() => {
        if (dataConnRef.current?.open) {
          send({ type: 'ping', time: Date.now() })
          
          // Check for timeout
          if (Date.now() - lastPongRef.current > 10000) {
            console.warn('[CONN] Connection appears dead')
            setConnectionHealth('poor')
          }
        }
      }, 3000)
    })

    conn.on('data', (d) => handleData(d as any))

    conn.on('close', () => {
      console.log('[CONN] CLOSED')
      dataConnRef.current = null
      setConnectionHealth('disconnected')
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      
      // Attempt reconnect
      if (mountedRef.current && reconnectAttempts.current < 5) {
        reconnectAttempts.current++
        setStatus('reconnecting')
        console.log('[CONN] Reconnect attempt', reconnectAttempts.current)
        
        setTimeout(() => {
          if (mountedRef.current && peerRef.current && !isHost) {
            const hostId = `talk-${callId}-host`
            const newConn = peerRef.current.connect(hostId, { reliable: true })
            setupConnection(newConn)
          }
        }, 2000 * reconnectAttempts.current)
      } else if (reconnectAttempts.current >= 5) {
        setStatus('error')
        setError('Connection lost. Please refresh and try again.')
      } else {
        setStatus('waiting')
      }
    })

    conn.on('error', (err) => {
      console.error('[CONN] Error:', err)
    })
  }, [callId, handleData, isHost, send])

  // Initialize peer connection
  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      try {
        console.log('[INIT] VoxLink Talk Mode v3.0')
        console.log('[INIT] Starting as', isHost ? 'HOST' : 'GUEST')
        setStatus(isHost ? 'waiting' : 'connecting')

        // Request microphone
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true })
          console.log('[INIT] Microphone granted')
        } catch (e) {
          console.error('[INIT] Microphone denied:', e)
          setError('Microphone access required. Please allow and refresh.')
          setStatus('error')
          return
        }

        // Create peer with robust ICE configuration
        const peerId = isHost 
          ? `talk-${callId}-host` 
          : `talk-${callId}-${Date.now().toString(36)}`
        
        console.log('[INIT] Creating peer:', peerId)
        
        const peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              // Google STUN servers
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              // Additional public STUN servers
              { urls: 'stun:stun.stunprotocol.org:3478' },
              { urls: 'stun:stun.voip.blackberry.com:3478' },
              // Free TURN servers for NAT traversal
              {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              },
              {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
              }
            ],
            iceCandidatePoolSize: 10
          }
        })

        peerRef.current = peer

        peer.on('open', (id) => {
          console.log('[PEER] Open:', id)
          if (!mountedRef.current) return
          
          if (isHost) {
            setStatus('waiting')
          } else {
            // Connect to host
            const hostId = `talk-${callId}-host`
            console.log('[PEER] Connecting to:', hostId)
            const conn = peer.connect(hostId, { reliable: true })
            setupConnection(conn)
          }
          
          // Start speech
          startSpeech()
        })

        // Accept incoming connections (host)
        peer.on('connection', (conn) => {
          console.log('[PEER] Incoming connection from:', conn.peer)
          setupConnection(conn)
        })

        peer.on('error', (err) => {
          console.error('[PEER] Error:', err.type, err)
          
          if (err.type === 'peer-unavailable') {
            setError('Partner not found. Make sure they started the conversation first.')
            setStatus('error')
          } else if (err.type === 'unavailable-id') {
            setError('This room code is already in use. Try a different one.')
            setStatus('error')
          } else if (err.type === 'network') {
            // Attempt reconnect
            if (reconnectAttempts.current < 5) {
              setStatus('reconnecting')
              setTimeout(() => peer.reconnect(), 2000)
            }
          }
        })

        peer.on('disconnected', () => {
          console.log('[PEER] Disconnected')
          if (mountedRef.current && reconnectAttempts.current < 5) {
            setStatus('reconnecting')
            peer.reconnect()
          }
        })

      } catch (e: any) {
        console.error('[INIT] Error:', e)
        setError(e.message || 'Failed to start')
        setStatus('error')
      }
    }

    init()

    return () => {
      console.log('[CLEANUP]')
      mountedRef.current = false
      
      if (speechRef.current) {
        try { speechRef.current.stop() } catch {}
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
      }
      
      if (peerRef.current) {
        peerRef.current.destroy()
      }
    }
  }, [callId, isHost, myName, setupConnection, startSpeech])

  // Toggle listening
  const toggleListening = useCallback(() => {
    const newState = !listening
    console.log('[LISTEN] Toggle to:', newState)
    setListening(newState)
    listeningRef.current = newState
    
    if (newState) {
      startSpeech()
    } else {
      if (speechRef.current) {
        try { speechRef.current.stop() } catch {}
      }
    }
  }, [listening, startSpeech])

  // Share functions
  const shareLink = useCallback(() => {
    const url = `${window.location.origin}/?join=talk&id=${callId}`
    
    if (navigator.share) {
      navigator.share({ 
        title: 'VoxBridge', 
        text: 'Join my translated conversation / Únete a mi conversación traducida', 
        url 
      }).catch(() => {
        navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } else {
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [callId])

  const endCall = useCallback(() => {
    if (speechRef.current) try { speechRef.current.stop() } catch {}
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
    if (peerRef.current) peerRef.current.destroy()
    router.push('/')
  }, [router])

  // Get latest messages
  const lastPartnerMessage = messages.filter(m => !m.isFromMe).slice(-1)[0]
  const lastMyMessage = messages.filter(m => m.isFromMe).slice(-1)[0]

  // --- RENDER ---

  // No name
  if (!myName) {
    return (
      <div className="h-[100dvh] flex items-center justify-center p-4 bg-black text-white">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Please enter your name / Por favor ingresa tu nombre</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-green-500 rounded-xl">
            Go Home / Ir a Inicio
          </button>
        </div>
      </div>
    )
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="h-[100dvh] flex items-center justify-center p-4 bg-black text-white">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">❌</div>
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-green-500 rounded-xl">
            Go Home / Ir a Inicio
          </button>
        </div>
      </div>
    )
  }

  // Waiting/Connecting state
  if (status === 'connecting' || status === 'waiting' || status === 'reconnecting') {
    return (
      <div className="h-[100dvh] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="text-center max-w-sm w-full">
          {/* Spinner */}
          <div className={`w-20 h-20 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-6 ${
            status === 'reconnecting' ? 'border-yellow-500' : 'border-green-500'
          }`} />
          
          {/* Status text */}
          <h2 className="text-xl font-semibold mb-2">
            {status === 'reconnecting' 
              ? 'Reconnecting... / Reconectando...'
              : status === 'waiting' 
                ? 'Waiting for partner...' 
                : 'Connecting...'}
          </h2>
          <p className="text-gray-400 mb-6">
            {status === 'reconnecting'
              ? `Attempt ${reconnectAttempts.current}/5`
              : status === 'waiting' 
                ? 'Esperando compañero...' 
                : 'Conectando...'}
          </p>

          {/* Share section (host only when waiting) */}
          {isHost && status === 'waiting' && (
            <>
              <div className="bg-gray-800 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-400 mb-2">Room Code / Código:</p>
                <p className="text-4xl font-mono font-bold text-green-400 tracking-wider">{callId}</p>
              </div>

              <button 
                onClick={shareLink}
                className="w-full py-4 bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-xl font-semibold text-lg mb-4 transition-colors"
              >
                {copied ? '✓ Link Copied! / ¡Enlace copiado!' : '📤 Share Link / Compartir enlace'}
              </button>

              <div className="text-xs text-gray-500 space-y-1">
                <p>🌍 Works worldwide on any device</p>
                <p>🌎 Funciona en todo el mundo</p>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Connected - Main UI
  return (
    <div className="h-[100dvh] flex flex-col bg-black text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 backdrop-blur shrink-0 safe-top">
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className={`w-3 h-3 rounded-full ${
            connectionHealth === 'good' ? 'bg-green-500' :
            connectionHealth === 'poor' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {partnerName || 'Partner'} {partnerLang === 'en' ? '🇺🇸' : '🇪🇸'}
            </span>
            {lastPing > 0 && (
              <span className="text-xs text-gray-500">{lastPing}ms</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 active:bg-gray-600"
          >
            📝
          </button>
          <button 
            onClick={shareLink}
            className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 active:bg-gray-600"
          >
            {copied ? '✓' : '📤'}
          </button>
        </div>
      </div>

      {/* Main Translation Display */}
      <div className="flex-1 flex flex-col justify-center p-4 overflow-hidden">
        {/* Partner's message (translated for me) - LARGE */}
        <div className="flex-1 flex items-center justify-center">
          {lastPartnerMessage ? (
            <div className="text-center px-2 max-w-full">
              <p className="text-xs text-gray-500 mb-3">
                {lastPartnerMessage.speaker} ({lastPartnerMessage.speakerLang === 'en' ? '🇺🇸' : '🇪🇸'}):
              </p>
              <p className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight text-green-400 break-words">
                {lastPartnerMessage.translated}
              </p>
              <p className="text-base text-gray-500 mt-4 break-words">
                "{lastPartnerMessage.original}"
              </p>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <p className="text-6xl mb-4">👂</p>
              <p className="text-xl">Waiting for {partnerName || 'partner'} to speak...</p>
              <p className="text-base mt-2">Esperando que {partnerName || 'tu compañero'} hable...</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-800 my-4" />

        {/* My message (what I said + translation) - smaller */}
        <div className="h-28 flex items-center justify-center">
          {interim ? (
            <div className="text-center">
              <p className="text-xl text-blue-400 animate-pulse">{interim}...</p>
              <p className="text-xs text-gray-600 mt-1">Listening... / Escuchando...</p>
            </div>
          ) : lastMyMessage ? (
            <div className="text-center px-4">
              <p className="text-lg text-white/90">{lastMyMessage.original}</p>
              <p className="text-base text-yellow-400 mt-1">→ {lastMyMessage.translated}</p>
            </div>
          ) : (
            <p className="text-gray-600">Speak to translate... / Habla para traducir...</p>
          )}
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="h-56 bg-gray-900/95 backdrop-blur border-t border-gray-700 overflow-hidden flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
            <span className="text-sm font-medium">📝 History / Historial</span>
            <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-gray-700 rounded">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 text-sm">No messages yet / Sin mensajes aún</p>
            ) : (
              messages.map(m => (
                <div key={m.id} className={`p-2 rounded-lg ${m.isFromMe ? 'bg-blue-900/50 ml-8' : 'bg-green-900/50 mr-8'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{m.speaker}</span>
                    <span className="text-xs">{m.speakerLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                  </div>
                  <p className="text-sm">{m.original}</p>
                  <p className="text-sm text-yellow-400">→ {m.translated}</p>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-8 p-4 bg-gray-900/90 backdrop-blur shrink-0 safe-bottom">
        {/* Main mic button */}
        <button
          onClick={toggleListening}
          className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all shadow-lg ${
            listening 
              ? 'bg-green-600 hover:bg-green-700 active:bg-green-800 animate-pulse' 
              : 'bg-gray-700 hover:bg-gray-600 active:bg-gray-500'
          }`}
        >
          {listening ? '🎤' : '🔇'}
        </button>
        
        {/* End button */}
        <button
          onClick={endCall}
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-lg"
        >
          ✕
        </button>
      </div>

      {/* Status footer */}
      <div className="px-4 py-2 bg-black text-center shrink-0">
        <p className="text-xs text-gray-600">
          {listening 
            ? `🎤 ${myLang === 'en' ? 'English' : 'Español'} • ${connectionHealth === 'good' ? '🟢 Connected' : '🟡 Unstable'}`
            : 'Tap mic to speak / Toca para hablar'
          }
        </p>
      </div>
    </div>
  )
}

// Main export with Suspense
export default function TalkMode() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading VoxLink...</p>
        </div>
      </div>
    }>
      <TalkModeContent />
    </Suspense>
  )
}
