'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type ConnectionStatus = 'initializing' | 'waiting' | 'connecting' | 'connected' | 'error'

export default function FaceToFace() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'
  const partnerLang = userLang === 'en' ? 'es' : 'en'

  // Connection state
  const [status, setStatus] = useState<ConnectionStatus>('initializing')
  const [statusMessage, setStatusMessage] = useState('Initializing...')
  const [isConnected, setIsConnected] = useState(false)

  // Speech state
  const [isListening, setIsListening] = useState(false)
  const [myText, setMyText] = useState('')
  const [myTranslation, setMyTranslation] = useState('')
  const [partnerText, setPartnerText] = useState('')
  const [partnerTranslation, setPartnerTranslation] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  // Refs
  const recognitionRef = useRef<any>(null)
  const peerRef = useRef<any>(null)
  const connRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const mountedRef = useRef(true)
  const isListeningRef = useRef(false)

  // Keep ref in sync
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // TURN servers config (same as call page)
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
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

  const log = useCallback((msg: string) => {
    console.log(`[VoxLink Talk] ${msg}`)
  }, [])

  // Initialize PeerJS connection
  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      try {
        setStatus('initializing')
        setStatusMessage('Setting up connection...')

        const { default: Peer } = await import('peerjs')

        const peerConfig: any = {
          config: {
            iceServers,
            iceCandidatePoolSize: 10
          },
          debug: 2
        }

        let p: any
        if (isHost) {
          p = new Peer(roomId, peerConfig)
          log(`Creating peer as HOST with ID: ${roomId}`)
        } else {
          p = new Peer(peerConfig)
          log('Creating peer as GUEST')
        }

        peerRef.current = p

        p.on('open', (id: string) => {
          if (!mountedRef.current) return
          log(`Peer connected with ID: ${id}`)

          if (isHost) {
            setStatus('waiting')
            setStatusMessage('Waiting for partner to connect...')
          } else {
            setStatus('connecting')
            setStatusMessage('Connecting to partner...')

            setTimeout(() => {
              if (!mountedRef.current || !peerRef.current) return
              log(`Guest connecting to host: ${roomId}`)
              const connection = p.connect(roomId, { reliable: true })
              setupConnection(connection)
            }, 1000)
          }
        })

        p.on('connection', (connection: any) => {
          if (!mountedRef.current) return
          log('Incoming connection from peer')
          setupConnection(connection)
        })

        p.on('error', (err: any) => {
          log(`Peer error: ${err.type} - ${err.message || err}`)

          if (err.type === 'peer-unavailable') {
            setStatusMessage('Partner not found. Make sure they have the room open.')
          } else if (err.type === 'unavailable-id') {
            setStatusMessage('Room already in use. Try a different link.')
          } else {
            setStatusMessage(`Connection error: ${err.type}`)
          }
          setStatus('error')
        })

        p.on('disconnected', () => {
          log('Peer disconnected')
          if (mountedRef.current && isConnected) {
            p.reconnect()
          }
        })

      } catch (err) {
        log(`Init error: ${err}`)
        setStatusMessage('Failed to initialize connection')
        setStatus('error')
      }
    }

    const setupConnection = (connection: any) => {
      connRef.current = connection

      connection.on('open', () => {
        if (!mountedRef.current) return
        log('Data connection established')
        setStatus('connected')
        setStatusMessage('Connected!')
        setIsConnected(true)
      })

      connection.on('data', (data: any) => {
        if (!mountedRef.current) return
        log(`Received: ${data.type}`)
        if (data.type === 'speech') {
          setPartnerText(data.text)
        } else if (data.type === 'translation') {
          setPartnerTranslation(data.text)
        }
      })

      connection.on('close', () => {
        if (!mountedRef.current) return
        log('Connection closed')
        setStatusMessage('Partner disconnected')
        setIsConnected(false)
        setStatus('error')
      })

      connection.on('error', (err: any) => {
        log(`Connection error: ${err}`)
        setStatusMessage('Connection error')
        setStatus('error')
      })
    }

    init()

    return () => {
      mountedRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      if (peerRef.current) {
        try { peerRef.current.destroy() } catch {}
      }
    }
  }, [roomId, isHost, log])

  // Send data to partner
  const sendToPartner = useCallback((type: string, text: string) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type, text })
      log(`Sent ${type}: ${text.substring(0, 30)}...`)
    }
  }, [log])

  // Translate text
  const translate = useCallback(async (text: string) => {
    if (!text.trim()) return

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          sourceLang: userLang,
          targetLang: partnerLang
        })
      })

      const data = await res.json()
      if (data.translation) {
        setMyTranslation(data.translation)
        sendToPartner('translation', data.translation)
      }
    } catch (err) {
      log(`Translation error: ${err}`)
    }
  }, [userLang, partnerLang, sendToPartner, log])

  // Start listening
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition requires Chrome or Edge browser')
      return
    }

    if (!isConnected) {
      alert('Wait for partner to connect first')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = userLang === 'en' ? 'en-US' : 'es-ES'

    finalTranscriptRef.current = ''

    recognition.onresult = (event: any) => {
      let interim = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcript + ' '
          const fullText = finalTranscriptRef.current.trim()
          setMyText(fullText)
          sendToPartner('speech', fullText)
          translate(fullText)
        } else {
          interim = transcript
        }
      }

      const display = finalTranscriptRef.current + interim
      setMyText(display)
    }

    recognition.onerror = (event: any) => {
      log(`Speech error: ${event.error}`)
      if (event.error === 'not-allowed') {
        alert('Microphone permission denied. Please allow access.')
      }
    }

    recognition.onend = () => {
      if (isListeningRef.current && mountedRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isConnected, userLang, sendToPartner, translate, log])

  const stopListening = useCallback(() => {
    setIsListening(false)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch {}
    }
  }, [])

  const clearAll = useCallback(() => {
    setMyText('')
    setMyTranslation('')
    finalTranscriptRef.current = ''
  }, [])

  const getJoinLink = useCallback(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/talk/${roomId}?host=false&name=Partner&lang=${partnerLang}`
  }, [roomId, partnerLang])

  const copyJoinLink = useCallback(async () => {
    const link = getJoinLink()
    try {
      await navigator.clipboard.writeText(link)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      prompt('Copy this link:', link)
    }
  }, [getJoinLink])

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-green-500'
      case 'connecting':
      case 'waiting': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-white transition"
          >
            ← Back
          </button>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${status === 'connecting' || status === 'waiting' ? 'animate-pulse' : ''}`} />
              <span className="text-sm text-gray-400">Room: {roomId}</span>
            </div>
            <div className={`text-lg font-semibold ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
              {statusMessage}
            </div>
          </div>

          {isHost && !isConnected && (
            <button
              onClick={copyJoinLink}
              className={`px-4 py-2 rounded-lg text-white transition ${
                copySuccess ? 'bg-green-600' : 'bg-cyan-600 hover:bg-cyan-700'
              }`}
            >
              {copySuccess ? '✓ Copied!' : '📋 Copy Link'}
            </button>
          )}

          {(!isHost || isConnected) && <div className="w-24" />}
        </div>
      </div>

      {/* Share Link Panel (Host only, when waiting) */}
      {isHost && !isConnected && (
        <div className="max-w-6xl mx-auto mb-6">
          <div className="bg-gray-800/50 rounded-xl p-4">
            <p className="text-sm text-gray-400 mb-2">Share this link with the person you want to talk with:</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={getJoinLink()}
                className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm text-white"
              />
              <button
                onClick={copyJoinLink}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  copySuccess ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {copySuccess ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Your Side */}
          <div className="bg-[#1a1a2e]/80 backdrop-blur rounded-2xl p-6 border border-cyan-500/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-cyan-400">
                You ({userName}) - {userLang === 'en' ? 'English 🇺🇸' : 'Español 🇪🇸'}
              </h3>
              {isListening && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-red-400 text-sm">Recording</span>
                </div>
              )}
            </div>

            <div className="mb-4 min-h-[120px]">
              <div className="text-sm text-gray-400 mb-2">What you said:</div>
              <div className="text-white text-lg leading-relaxed">
                {myText || <span className="text-gray-600 italic">Speak to see text here...</span>}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-700 min-h-[100px]">
              <div className="text-sm text-green-400 mb-2">Translation to {partnerLang === 'en' ? 'English' : 'Español'}:</div>
              <div className="text-green-300 text-lg leading-relaxed">
                {myTranslation || <span className="text-gray-600 italic">Translation appears here...</span>}
              </div>
            </div>
          </div>

          {/* Partner Side */}
          <div className="bg-[#1a1a2e]/80 backdrop-blur rounded-2xl p-6 border border-purple-500/30">
            <h3 className="text-xl font-bold text-purple-400 mb-4">
              Partner - {partnerLang === 'en' ? 'English 🇺🇸' : 'Español 🇪🇸'}
            </h3>

            <div className="mb-4 min-h-[120px]">
              <div className="text-sm text-gray-400 mb-2">What they said:</div>
              <div className="text-white text-lg leading-relaxed">
                {partnerText || <span className="text-gray-600 italic">{isConnected ? 'Waiting for partner to speak...' : 'Partner not connected yet...'}</span>}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-700 min-h-[100px]">
              <div className="text-sm text-green-400 mb-2">Translation to {userLang === 'en' ? 'English' : 'Español'}:</div>
              <div className="text-green-300 text-lg leading-relaxed">
                {partnerTranslation || <span className="text-gray-600 italic">Translation appears here...</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {!isListening ? (
            <button
              onClick={startListening}
              disabled={!isConnected}
              className={`px-8 py-4 rounded-full text-white text-lg font-semibold transition shadow-lg ${
                isConnected
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/50'
                  : 'bg-gray-700 cursor-not-allowed'
              }`}
            >
              🎤 Start Speaking
            </button>
          ) : (
            <>
              <button
                onClick={stopListening}
                className="px-8 py-4 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 rounded-full text-white text-lg font-semibold transition shadow-lg shadow-red-500/50"
              >
                ⏹️ Stop
              </button>
              <button
                onClick={clearAll}
                className="px-6 py-4 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition"
              >
                🗑️ Clear
              </button>
            </>
          )}
        </div>

        {/* Room Info */}
        <div className="mt-6 text-center text-xs text-gray-500">
          Room: {roomId} • {isHost ? 'Host' : 'Guest'} • {userLang.toUpperCase()} → {partnerLang.toUpperCase()}
        </div>
      </div>
    </div>
  )
}
