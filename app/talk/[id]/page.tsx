'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type ConnectionState = 'initializing' | 'getting-media' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'ended'

interface Message {
  id: string
  speaker: 'local' | 'remote'
  original: string
  translated: string
  timestamp: Date
}

export default function FaceToFaceTalk() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'
  const remoteLang = userLang === 'en' ? 'es' : 'en'

  const [connectionState, setConnectionState] = useState<ConnectionState>('initializing')
  const [statusMessage, setStatusMessage] = useState('Initializing...')
  const [messages, setMessages] = useState<Message[]>([])
  const [isListening, setIsListening] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [showDebug, setShowDebug] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'pending'>('pending')

  const peerRef = useRef<any>(null)
  const dataChannelRef = useRef<any>(null)
  const recognitionRef = useRef<any>(null)
  const mountedRef = useRef(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const translationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[VoxBridge Talk ${timestamp}] ${msg}`)
    setDebugLog(prev => [...prev.slice(-50), `${timestamp}: ${msg}`])
  }, [])

  // Updated TURN servers
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:a.relay.metered.ca:80',
      username: 'e8dd65b92ed50f3a0f709341',
      credential: 'uWdWNmkhvyqTmFGo'
    },
    {
      urls: 'turn:a.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65b92ed50f3a0f709341',
      credential: 'uWdWNmkhvyqTmFGo'
    },
    {
      urls: 'turn:a.relay.metered.ca:443',
      username: 'e8dd65b92ed50f3a0f709341',
      credential: 'uWdWNmkhvyqTmFGo'
    },
    {
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92ed50f3a0f709341',
      credential: 'uWdWNmkhvyqTmFGo'
    }
  ]

  const getJoinLink = useCallback(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/talk/${roomId}?host=false&name=Guest&lang=${remoteLang}`
  }, [roomId, remoteLang])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const cleanup = useCallback(() => {
    log('Cleaning up...')
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(e) {}
    }
    if (dataChannelRef.current) {
      try { dataChannelRef.current.close() } catch(e) {}
    }
    if (peerRef.current) {
      try { peerRef.current.destroy() } catch(e) {}
    }
  }, [log])

  const translateText = useCallback(async (text: string, fromLang: string, toLang: string): Promise<string> => {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`)
      const data = await response.json()
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText
      }
      return `[Translation unavailable] ${text}`
    } catch (err) {
      log(`Translation error: ${err}`)
      return `[Translation error] ${text}`
    }
  }, [log])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    log(`Sending message: "${text.substring(0, 50)}..."`)

    const translated = await translateText(text, userLang, remoteLang)

    const message: Message = {
      id: Date.now().toString(),
      speaker: 'local',
      original: text,
      translated: translated,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, message])

    if (dataChannelRef.current?.readyState === 'open') {
      try {
        dataChannelRef.current.send(JSON.stringify({
          type: 'message',
          original: text,
          translated: translated,
          fromLang: userLang
        }))
        log('Message sent via data channel')
      } catch (err) {
        log(`Error sending message: ${err}`)
      }
    } else {
      log(`Data channel not open: ${dataChannelRef.current?.readyState}`)
    }
  }, [userLang, remoteLang, translateText, log])

  const handleDataChannelMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.data)
      log(`Received: ${data.type}`)

      if (data.type === 'message') {
        const message: Message = {
          id: Date.now().toString(),
          speaker: 'remote',
          original: data.original,
          translated: data.translated,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, message])
      }
    } catch (err) {
      log(`Error parsing message: ${err}`)
    }
  }, [log])

  const setupDataChannel = useCallback((channel: any) => {
    log('Setting up data channel...')
    dataChannelRef.current = channel

    channel.onopen = () => {
      log('Data channel opened')
      setConnectionState('connected')
      setStatusMessage('Connected! Tap the microphone to speak.')
    }

    channel.onclose = () => {
      log('Data channel closed')
      if (mountedRef.current && connectionState === 'connected') {
        setStatusMessage('Connection lost')
        setConnectionState('ended')
      }
    }

    channel.onerror = (err: any) => {
      log(`Data channel error: ${err}`)
    }

    channel.onmessage = handleDataChannelMessage
  }, [handleDataChannelMessage, connectionState, log])

  const initializePeer = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      setConnectionState('initializing')
      setStatusMessage('Connecting to server...')
      log('Loading PeerJS...')

      const { default: Peer } = await import('peerjs')

      const peerConfig: any = {
        config: {
          iceServers,
          iceCandidatePoolSize: 10
        },
        debug: 2
      }

      log(`Creating peer as ${isHost ? 'HOST' : 'GUEST'}, room: ${roomId}`)

      const peerInstance = isHost
        ? new Peer(roomId, peerConfig)
        : new Peer(peerConfig)

      peerRef.current = peerInstance

      peerInstance.on('open', (id: string) => {
        if (!mountedRef.current) return
        log(`Peer connected with ID: ${id}`)

        if (isHost) {
          setConnectionState('waiting')
          setStatusMessage('Share the link for someone to join')

          // Create data channel for host
          const conn = peerInstance.connect(roomId + '-data', { reliable: true })
          // Host waits for incoming connection
        } else {
          setConnectionState('connecting')
          setStatusMessage('Connecting to host...')

          setTimeout(() => {
            if (!mountedRef.current || !peerRef.current) return

            log(`Connecting to room: ${roomId}`)
            const conn = peerRef.current.connect(roomId, { reliable: true })

            if (!conn) {
              log('Connection returned null')
              setStatusMessage('Could not reach host')
              setConnectionState('failed')
              return
            }

            setupDataChannel(conn)
          }, 1000)
        }
      })

      peerInstance.on('connection', (conn: any) => {
        log('Incoming connection...')
        setupDataChannel(conn)
      })

      peerInstance.on('disconnected', () => {
        log('Peer disconnected')
        if (mountedRef.current && connectionState === 'connected') {
          setConnectionState('reconnecting')
          setStatusMessage('Reconnecting...')
          peerInstance.reconnect()
        }
      })

      peerInstance.on('error', (err: any) => {
        log(`Peer error: ${err.type} - ${err.message || err}`)

        if (err.type === 'peer-unavailable') {
          setStatusMessage('Room not found. Host may have left.')
          setConnectionState('failed')
        } else if (err.type === 'unavailable-id') {
          setStatusMessage('Room already in use.')
          setConnectionState('failed')
        } else {
          setStatusMessage(`Error: ${err.type || 'Connection failed'}`)
          setConnectionState('failed')
        }
      })

    } catch (err: any) {
      log(`Init error: ${err}`)
      setStatusMessage(`Setup error: ${err.message}`)
      setConnectionState('failed')
    }
  }, [isHost, roomId, iceServers, setupDataChannel, connectionState, log])

  const initSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      log('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false // Better for mobile
    recognition.interimResults = true
    recognition.lang = userLang === 'en' ? 'en-US' : 'es-ES'

    recognition.onstart = () => {
      log('Speech recognition started')
      setIsListening(true)
    }

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      setCurrentTranscript(interimTranscript || finalTranscript)

      if (finalTranscript) {
        log(`Final transcript: "${finalTranscript}"`)
        // Debounce translation
        if (translationTimeoutRef.current) {
          clearTimeout(translationTimeoutRef.current)
        }
        translationTimeoutRef.current = setTimeout(() => {
          sendMessage(finalTranscript)
          setCurrentTranscript('')
        }, 300)
      }
    }

    recognition.onerror = (event: any) => {
      log(`Speech error: ${event.error}`)
      setIsListening(false)

      if (event.error === 'not-allowed') {
        setMicPermission('denied')
        setStatusMessage('Microphone access denied')
      }
    }

    recognition.onend = () => {
      log('Speech recognition ended')
      setIsListening(false)
    }

    recognitionRef.current = recognition
    log('Speech recognition initialized')
  }, [userLang, sendMessage, log])

  const toggleListening = useCallback(async () => {
    if (!recognitionRef.current) {
      initSpeechRecognition()
    }

    if (isListening) {
      recognitionRef.current?.stop()
    } else {
      try {
        // Request mic permission first
        await navigator.mediaDevices.getUserMedia({ audio: true })
        setMicPermission('granted')
        recognitionRef.current?.start()
      } catch (err: any) {
        log(`Mic permission error: ${err}`)
        setMicPermission('denied')
        setStatusMessage('Microphone access required')
      }
    }
  }, [isListening, initSpeechRecognition, log])

  useEffect(() => {
    mountedRef.current = true
    log('Component mounted')
    initializePeer()
    initSpeechRecognition()

    return () => {
      log('Component unmounting')
      mountedRef.current = false
      cleanup()
    }
  }, [])

  const copyLink = async () => {
    const link = getJoinLink()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = link
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      alert(`Share this link:\n${link}`)
    }
  }

  const endSession = () => {
    cleanup()
    router.push('/')
  }

  const retryConnection = () => {
    cleanup()
    setTimeout(() => initializePeer(), 500)
  }

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'bg-green-500'
      case 'connecting':
      case 'reconnecting': return 'bg-yellow-500'
      case 'waiting': return 'bg-blue-500'
      case 'failed':
      case 'ended': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${connectionState === 'connecting' ? 'animate-pulse' : ''}`} />
            <span className="text-sm">{statusMessage}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-gray-500"
            >
              {showDebug ? 'Hide' : 'Debug'}
            </button>
            <button
              onClick={endSession}
              className="text-red-500 text-sm"
            >
              End
            </button>
          </div>
        </div>

        {showDebug && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs font-mono h-24 overflow-y-auto">
            {debugLog.map((msg, i) => (
              <div key={i} className="text-gray-400">{msg}</div>
            ))}
          </div>
        )}
      </div>

      {/* Share Link (Host waiting) */}
      {isHost && connectionState === 'waiting' && (
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <p className="text-sm text-gray-400 mb-2">Share this link:</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={getJoinLink()}
              className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={copyLink}
              className={`px-4 py-2 rounded ${copySuccess ? 'bg-green-600' : 'bg-blue-600'}`}
            >
              {copySuccess ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Retry button */}
      {connectionState === 'failed' && (
        <div className="p-4 text-center">
          <button
            onClick={retryConnection}
            className="px-6 py-3 bg-blue-600 rounded-lg"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && connectionState === 'connected' && (
          <div className="text-center text-gray-500 mt-8">
            <p>Tap the microphone button and speak</p>
            <p className="text-sm mt-2">Your speech will be translated automatically</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.speaker === 'local' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.speaker === 'local'
                  ? 'bg-blue-600'
                  : 'bg-gray-700'
              }`}
            >
              <p className="text-sm md:text-base">{msg.speaker === 'local' ? msg.original : msg.translated}</p>
              <p className="text-xs text-gray-300 mt-1 opacity-75">
                {msg.speaker === 'local' ? msg.translated : msg.original}
              </p>
            </div>
          </div>
        ))}

        {currentTranscript && (
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-lg p-3 bg-blue-600/50 border border-blue-500">
              <p className="text-sm">{currentTranscript}</p>
              <p className="text-xs text-blue-300">Listening...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Mic Button */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex justify-center">
          <button
            onClick={toggleListening}
            disabled={connectionState !== 'connected' && connectionState !== 'waiting'}
            className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all active:scale-95 ${
              isListening
                ? 'bg-red-600 animate-pulse'
                : connectionState === 'connected'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-600 opacity-50'
            }`}
          >
            {isListening ? '⏹️' : '🎤'}
          </button>
        </div>
        <p className="text-center text-xs text-gray-500 mt-2">
          {isListening ? 'Tap to stop' : 'Tap to speak'} • {userLang.toUpperCase()} → {remoteLang.toUpperCase()}
        </p>
      </div>
    </div>
  )
}
