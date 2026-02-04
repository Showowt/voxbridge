'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type ConnectionState = 'initializing' | 'getting-media' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'ended'

interface Subtitle {
  id: string
  speaker: 'local' | 'remote'
  original: string
  translated: string
  timestamp: number
}

export default function VideoCall() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'Guest'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'
  const remoteLang = userLang === 'en' ? 'es' : 'en'

  const [connectionState, setConnectionState] = useState<ConnectionState>('initializing')
  const [statusMessage, setStatusMessage] = useState('Initializing...')
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  // Translation state
  const [subtitles, setSubtitles] = useState<Subtitle[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const dataConnRef = useRef<any>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionRef = useRef<any>(null)
  const subtitleTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const MAX_RETRIES = 3
  const SUBTITLE_DURATION = 5000

  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[VoxBridge ${timestamp}] ${msg}`)
    setDebugLog(prev => [...prev.slice(-50), `${timestamp}: ${msg}`])
  }, [])

  // Metered.ca TURN servers
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
    return `${window.location.origin}/call/${roomId}?host=false&name=Guest&lang=${remoteLang}`
  }, [roomId, remoteLang])

  // Translation function
  const translateText = useCallback(async (text: string, fromLang: string, toLang: string): Promise<string> => {
    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`
      )
      const data = await response.json()
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText
      }
      return text
    } catch (err) {
      log(`Translation error: ${err}`)
      return text
    }
  }, [log])

  // Add subtitle with auto-remove
  const addSubtitle = useCallback((subtitle: Subtitle) => {
    setSubtitles(prev => [...prev.slice(-4), subtitle])

    // Remove after duration
    setTimeout(() => {
      setSubtitles(prev => prev.filter(s => s.id !== subtitle.id))
    }, SUBTITLE_DURATION)
  }, [])

  // Handle incoming data channel messages (remote subtitles)
  const handleDataMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'subtitle') {
        log(`Received subtitle: "${data.original.substring(0, 30)}..."`)
        addSubtitle({
          id: Date.now().toString() + '-remote',
          speaker: 'remote',
          original: data.original,
          translated: data.translated,
          timestamp: Date.now()
        })
      }
    } catch (err) {
      log(`Data parse error: ${err}`)
    }
  }, [log, addSubtitle])

  // Setup data connection for subtitles
  const setupDataConnection = useCallback((conn: any) => {
    dataConnRef.current = conn

    conn.on('open', () => {
      log('Data channel opened for subtitles')
    })

    conn.on('data', handleDataMessage)

    conn.on('error', (err: any) => {
      log(`Data channel error: ${err}`)
    })
  }, [log, handleDataMessage])

  // Send subtitle to remote peer
  const sendSubtitle = useCallback(async (text: string) => {
    if (!text.trim()) return

    const translated = await translateText(text, userLang, remoteLang)

    // Add local subtitle
    addSubtitle({
      id: Date.now().toString() + '-local',
      speaker: 'local',
      original: text,
      translated: translated,
      timestamp: Date.now()
    })

    // Send to remote via data channel
    if (dataConnRef.current?.open) {
      try {
        dataConnRef.current.send(JSON.stringify({
          type: 'subtitle',
          original: text,
          translated: translated,
          fromLang: userLang
        }))
      } catch (err) {
        log(`Send subtitle error: ${err}`)
      }
    }
  }, [userLang, remoteLang, translateText, addSubtitle, log])

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      log('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
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

      setCurrentTranscript(interimTranscript)

      if (finalTranscript) {
        log(`Final: "${finalTranscript.substring(0, 50)}..."`)
        sendSubtitle(finalTranscript)
        setCurrentTranscript('')
      }
    }

    recognition.onerror = (event: any) => {
      log(`Speech error: ${event.error}`)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsListening(false)
      }
    }

    recognition.onend = () => {
      log('Speech recognition ended')
      // Auto-restart if still connected
      if (mountedRef.current && connectionState === 'connected' && !isMuted) {
        try {
          recognition.start()
        } catch (e) {
          log('Could not restart recognition')
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
  }, [userLang, connectionState, isMuted, sendSubtitle, log])

  // Start/stop speech recognition
  const toggleSpeechRecognition = useCallback((start: boolean) => {
    if (!recognitionRef.current) {
      initSpeechRecognition()
    }

    if (start && recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start()
      } catch (e) {
        log('Recognition already started')
      }
    } else if (!start && recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {}
      setIsListening(false)
    }
  }, [initSpeechRecognition, isListening, log])

  const cleanup = useCallback(() => {
    log('Cleaning up...')
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(e) {}
    }
    if (dataConnRef.current) {
      try { dataConnRef.current.close() } catch(e) {}
      dataConnRef.current = null
    }
    if (callRef.current) {
      try { callRef.current.close() } catch(e) {}
      callRef.current = null
    }
    if (peerRef.current) {
      try { peerRef.current.destroy() } catch(e) {}
      peerRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
  }, [log])

  const initializePeer = useCallback(async () => {
    if (!mountedRef.current) return

    try {
      setConnectionState('getting-media')
      setStatusMessage('Requesting camera access...')
      log('Requesting media devices...')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })

      log(`Got media: ${stream.getTracks().map(t => t.kind).join(', ')}`)

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      localStreamRef.current = stream
      setLocalStream(stream)

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      setConnectionState('initializing')
      setStatusMessage('Connecting to server...')
      log('Loading PeerJS...')

      const { default: Peer } = await import('peerjs')

      const peerConfig: any = {
        config: { iceServers, iceCandidatePoolSize: 10 },
        debug: 2
      }

      log(`Creating peer as ${isHost ? 'HOST' : 'GUEST'}, room: ${roomId}`)

      // Host uses roomId as peer ID, guest gets random ID
      const peerInstance = isHost
        ? new Peer(roomId, peerConfig)
        : new Peer(peerConfig)

      peerRef.current = peerInstance

      peerInstance.on('open', (id: string) => {
        if (!mountedRef.current) return
        log(`Peer open with ID: ${id}`)

        if (isHost) {
          setConnectionState('waiting')
          setStatusMessage('Waiting for guest to join...')
        } else {
          // Guest: connect data channel first, then call
          setConnectionState('connecting')
          setStatusMessage('Connecting to host...')

          setTimeout(() => {
            if (!mountedRef.current || !peerRef.current || !localStreamRef.current) return

            // Connect data channel for subtitles
            log(`Connecting data channel to ${roomId}`)
            const dataConn = peerRef.current.connect(roomId, { reliable: true })
            setupDataConnection(dataConn)

            // Make the video call
            log(`Calling ${roomId}`)
            const call = peerRef.current.call(roomId, localStreamRef.current)

            if (!call) {
              log('Call failed - host may not exist')
              setStatusMessage('Could not reach host')
              setConnectionState('failed')
              return
            }

            callRef.current = call

            call.on('stream', (remoteStreamData: MediaStream) => {
              if (!mountedRef.current) return
              log(`Got remote stream: ${remoteStreamData.getTracks().map(t => t.kind).join(', ')}`)
              setRemoteStream(remoteStreamData)
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStreamData
              }
              setConnectionState('connected')
              setStatusMessage('Connected!')

              // Start speech recognition
              initSpeechRecognition()
              toggleSpeechRecognition(true)
            })

            call.on('close', () => {
              if (!mountedRef.current) return
              log('Call closed')
              setConnectionState('ended')
              setStatusMessage('Call ended')
            })

            call.on('error', (err: any) => log(`Call error: ${err}`))
          }, 1000)
        }
      })

      // Host: handle incoming connections
      peerInstance.on('connection', (conn: any) => {
        log('Incoming data connection')
        setupDataConnection(conn)
      })

      peerInstance.on('call', (incomingCall: any) => {
        if (!mountedRef.current || !localStreamRef.current) return
        log('Incoming call - answering...')
        setConnectionState('connecting')

        incomingCall.answer(localStreamRef.current)
        callRef.current = incomingCall

        incomingCall.on('stream', (remoteStreamData: MediaStream) => {
          if (!mountedRef.current) return
          log(`Got caller stream: ${remoteStreamData.getTracks().map(t => t.kind).join(', ')}`)
          setRemoteStream(remoteStreamData)
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamData
          }
          setConnectionState('connected')
          setStatusMessage('Connected!')

          // Start speech recognition
          initSpeechRecognition()
          toggleSpeechRecognition(true)
        })

        incomingCall.on('close', () => {
          if (!mountedRef.current) return
          log('Caller hung up')
          setConnectionState('ended')
          setStatusMessage('Call ended')
        })
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
        } else if (err.type === 'network' && retryCount < MAX_RETRIES) {
          setConnectionState('reconnecting')
          setStatusMessage(`Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount(prev => prev + 1)
            cleanup()
            initializePeer()
          }, 3000)
        } else {
          setStatusMessage(`Error: ${err.type || 'Connection failed'}`)
          setConnectionState('failed')
        }
      })

    } catch (err: any) {
      log(`Init error: ${err.name} - ${err.message}`)
      if (err.name === 'NotAllowedError') {
        setStatusMessage('Camera access denied. Please allow and reload.')
      } else if (err.name === 'NotFoundError') {
        setStatusMessage('No camera found.')
      } else {
        setStatusMessage(`Error: ${err.message}`)
      }
      setConnectionState('failed')
    }
  }, [isHost, roomId, iceServers, retryCount, setupDataConnection, initSpeechRecognition, toggleSpeechRecognition, cleanup, log])

  useEffect(() => {
    mountedRef.current = true
    log('Component mounted')
    initializePeer()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)

        // Toggle speech recognition with mute
        if (!audioTrack.enabled) {
          toggleSpeechRecognition(false)
        } else if (connectionState === 'connected') {
          toggleSpeechRecognition(true)
        }
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
      }
    }
  }

  const copyLink = async () => {
    const link = getJoinLink()
    try {
      await navigator.clipboard.writeText(link)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      const textArea = document.createElement('textarea')
      textArea.value = link
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const endCall = () => {
    cleanup()
    router.push('/')
  }

  const retryConnection = () => {
    cleanup()
    setRetryCount(0)
    setTimeout(() => initializePeer(), 500)
  }

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected': return 'bg-green-500'
      case 'connecting':
      case 'reconnecting':
      case 'getting-media': return 'bg-yellow-500'
      case 'waiting': return 'bg-blue-500'
      case 'failed':
      case 'ended': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Status Bar */}
      <div className="p-3 flex items-center justify-between bg-gray-900/80">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()} ${['connecting', 'reconnecting'].includes(connectionState) ? 'animate-pulse' : ''}`} />
          <span className="text-sm">{statusMessage}</span>
          {isListening && <span className="text-xs text-green-400">🎤 Live</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-gray-500">
            {showDebug ? 'Hide' : 'Debug'}
          </button>
          <span className="text-xs text-gray-500">{userLang.toUpperCase()}→{remoteLang.toUpperCase()}</span>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div className="p-2 bg-gray-900 text-xs font-mono h-24 overflow-y-auto border-b border-gray-800">
          {debugLog.map((msg, i) => (
            <div key={i} className="text-gray-400">{msg}</div>
          ))}
        </div>
      )}

      {/* Video Container */}
      <div className="flex-1 relative">
        {/* Remote Video (Full screen) */}
        <div className="absolute inset-0 bg-gray-900">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">👤</div>
                <p className="text-gray-400">
                  {connectionState === 'waiting' ? 'Waiting for guest...' :
                   connectionState === 'connecting' ? 'Connecting...' :
                   connectionState === 'failed' ? 'Connection failed' : 'No video'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Local Video (Picture-in-picture) */}
        <div className="absolute top-4 right-4 w-28 h-36 md:w-36 md:h-48 bg-gray-800 rounded-lg overflow-hidden shadow-lg border-2 border-gray-700">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
          {isVideoOff && (
            <div className="w-full h-full flex items-center justify-center bg-gray-700">
              <span className="text-2xl">📷</span>
            </div>
          )}
          <div className="absolute bottom-1 left-1 text-xs bg-black/60 px-1 rounded">
            You {isMuted && '🔇'}
          </div>
        </div>

        {/* Subtitles Overlay */}
        <div className="absolute bottom-24 left-0 right-0 px-4">
          <div className="max-w-2xl mx-auto space-y-2">
            {/* Current transcript (live) */}
            {currentTranscript && (
              <div className="bg-blue-600/80 backdrop-blur px-4 py-2 rounded-lg text-center">
                <p className="text-sm">{currentTranscript}</p>
                <p className="text-xs text-blue-200">Speaking...</p>
              </div>
            )}

            {/* Recent subtitles */}
            {subtitles.map((sub) => (
              <div
                key={sub.id}
                className={`backdrop-blur px-4 py-2 rounded-lg ${
                  sub.speaker === 'local'
                    ? 'bg-blue-600/80 ml-auto max-w-[80%]'
                    : 'bg-gray-800/90 mr-auto max-w-[80%]'
                }`}
              >
                <p className="text-sm font-medium">
                  {sub.speaker === 'local' ? sub.original : sub.translated}
                </p>
                <p className="text-xs opacity-70">
                  {sub.speaker === 'local' ? sub.translated : sub.original}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Share Link Panel */}
        {isHost && connectionState === 'waiting' && (
          <div className="absolute top-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-gray-900/95 backdrop-blur p-4 rounded-lg border border-gray-700">
            <p className="text-sm text-gray-300 mb-2">Share this link to invite someone:</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={getJoinLink()}
                className="flex-1 bg-gray-800 rounded px-3 py-2 text-sm"
              />
              <button
                onClick={copyLink}
                className={`px-4 py-2 rounded font-medium ${copySuccess ? 'bg-green-600' : 'bg-blue-600'}`}
              >
                {copySuccess ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Retry Button */}
        {connectionState === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <button
              onClick={retryConnection}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-medium"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-gray-900/90 backdrop-blur">
        <div className="flex justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${
              isMuted ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${
              isVideoOff ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {isVideoOff ? '📷' : '🎥'}
          </button>
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-xl"
          >
            📞
          </button>
        </div>
        <p className="text-center text-xs text-gray-500 mt-2">
          Room: {roomId} • {isHost ? 'Host' : 'Guest'}
        </p>
      </div>
    </div>
  )
}
