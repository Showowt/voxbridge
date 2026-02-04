'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

type ConnectionState = 'initializing' | 'getting-media' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'ended'

export default function VideoCall() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'Guest'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'

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

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const mountedRef = useRef(true)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const MAX_RETRIES = 3

  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`[VoxBridge ${timestamp}] ${msg}`)
    setDebugLog(prev => [...prev.slice(-50), `${timestamp}: ${msg}`])
  }, [])

  // Updated TURN servers - using Metered.ca free tier
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Metered.ca free TURN servers (more reliable)
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
    return `${window.location.origin}/call/${roomId}?host=false&name=Guest&lang=${userLang === 'en' ? 'es' : 'en'}`
  }, [roomId, userLang])

  const cleanup = useCallback(() => {
    log('Cleaning up...')
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
    if (callRef.current) {
      try { callRef.current.close() } catch(e) { log('Call close error: ' + e) }
      callRef.current = null
    }
    if (peerRef.current) {
      try { peerRef.current.destroy() } catch(e) { log('Peer destroy error: ' + e) }
      peerRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
        log(`Stopped track: ${track.kind}`)
      })
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
        video: {
          facingMode: 'user',
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      log(`Got media stream: ${stream.getTracks().map(t => t.kind).join(', ')}`)

      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      localStreamRef.current = stream
      setLocalStream(stream)

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        log('Local video attached')
      }

      setConnectionState('initializing')
      setStatusMessage('Connecting to signaling server...')
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
          setStatusMessage('Share the link below for someone to join')
        } else {
          setConnectionState('connecting')
          setStatusMessage('Calling host...')
          log(`Attempting to call room: ${roomId}`)

          setTimeout(() => {
            if (!mountedRef.current || !peerRef.current || !localStreamRef.current) {
              log('Cannot call - refs not ready')
              return
            }

            try {
              const call = peerRef.current.call(roomId, localStreamRef.current)

              if (!call) {
                log('Call returned null - host may not exist')
                setStatusMessage('Could not reach host. Make sure they have the room open.')
                setConnectionState('failed')
                return
              }

              callRef.current = call
              log('Call initiated, waiting for answer...')

              call.on('stream', (remoteStreamData: MediaStream) => {
                if (!mountedRef.current) return
                log(`Received remote stream: ${remoteStreamData.getTracks().map(t => t.kind).join(', ')}`)
                setRemoteStream(remoteStreamData)
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.srcObject = remoteStreamData
                }
                setConnectionState('connected')
                setStatusMessage('Connected!')
                setRetryCount(0)
              })

              call.on('close', () => {
                if (!mountedRef.current) return
                log('Call closed by remote')
                setStatusMessage('Call ended')
                setConnectionState('ended')
              })

              call.on('error', (err: any) => {
                log(`Call error: ${err}`)
              })

              // Timeout if no stream received
              setTimeout(() => {
                if (mountedRef.current && connectionState === 'connecting') {
                  log('Timeout waiting for remote stream')
                }
              }, 15000)

            } catch (err) {
              log(`Error initiating call: ${err}`)
              setStatusMessage('Failed to connect to host')
              setConnectionState('failed')
            }
          }, 1000)
        }
      })

      peerInstance.on('call', (incomingCall: any) => {
        if (!mountedRef.current || !localStreamRef.current) return
        log('Receiving incoming call...')
        setStatusMessage('Connecting...')
        setConnectionState('connecting')

        incomingCall.answer(localStreamRef.current)
        callRef.current = incomingCall
        log('Answered call')

        incomingCall.on('stream', (remoteStreamData: MediaStream) => {
          if (!mountedRef.current) return
          log(`Received remote stream from caller: ${remoteStreamData.getTracks().map(t => t.kind).join(', ')}`)
          setRemoteStream(remoteStreamData)
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStreamData
          }
          setConnectionState('connected')
          setStatusMessage('Connected!')
        })

        incomingCall.on('close', () => {
          if (!mountedRef.current) return
          log('Incoming call closed')
          setStatusMessage('Call ended')
          setConnectionState('ended')
        })
      })

      peerInstance.on('disconnected', () => {
        log('Peer disconnected from server')
        if (mountedRef.current && connectionState === 'connected') {
          setStatusMessage('Connection interrupted, reconnecting...')
          setConnectionState('reconnecting')
          peerInstance.reconnect()
        }
      })

      peerInstance.on('error', (err: any) => {
        log(`Peer error: ${err.type} - ${err.message || err}`)

        if (err.type === 'peer-unavailable') {
          setStatusMessage('Room not found. Host may have left.')
          setConnectionState('failed')
        } else if (err.type === 'unavailable-id') {
          setStatusMessage('This room ID is already in use. Try a different link.')
          setConnectionState('failed')
        } else if (err.type === 'network') {
          if (retryCount < MAX_RETRIES) {
            setConnectionState('reconnecting')
            setStatusMessage(`Network error. Retrying... (${retryCount + 1}/${MAX_RETRIES})`)
            retryTimeoutRef.current = setTimeout(() => {
              setRetryCount(prev => prev + 1)
              initializePeer()
            }, 3000)
          } else {
            setStatusMessage('Network error. Please check your connection.')
            setConnectionState('failed')
          }
        } else {
          setStatusMessage(`Error: ${err.type || 'Unknown'}`)
          setConnectionState('failed')
        }
      })

    } catch (err: any) {
      log(`Initialization error: ${err.name} - ${err.message}`)

      if (err.name === 'NotAllowedError') {
        setStatusMessage('Camera/microphone access denied. Please allow access and reload.')
      } else if (err.name === 'NotFoundError') {
        setStatusMessage('No camera or microphone found.')
      } else if (err.name === 'NotReadableError') {
        setStatusMessage('Camera is in use by another app.')
      } else {
        setStatusMessage(`Setup error: ${err.message}`)
      }
      setConnectionState('failed')
    }
  }, [isHost, roomId, log, iceServers, retryCount, connectionState])

  useEffect(() => {
    mountedRef.current = true
    log('Component mounted, initializing...')
    initializePeer()

    return () => {
      log('Component unmounting...')
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
        log(`Microphone ${audioTrack.enabled ? 'unmuted' : 'muted'}`)
      }
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
        log(`Camera ${videoTrack.enabled ? 'on' : 'off'}`)
      }
    }
  }

  const copyLink = async () => {
    const link = getJoinLink()
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
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
      log('Link copied to clipboard')
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      log(`Copy failed: ${err}`)
      alert(`Share this link:\n${link}`)
    }
  }

  const endCall = () => {
    log('Ending call...')
    cleanup()
    router.push('/')
  }

  const retryConnection = () => {
    log('Manual retry requested')
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
    <div className="min-h-screen bg-gray-900 text-white p-4 pb-safe">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${connectionState === 'connecting' || connectionState === 'reconnecting' ? 'animate-pulse' : ''}`} />
          <span className="text-sm">{statusMessage}</span>
        </div>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          {showDebug ? 'Hide' : 'Debug'}
        </button>
      </div>

      {/* Debug Log */}
      {showDebug && (
        <div className="mb-4 p-2 bg-gray-800 rounded text-xs font-mono h-32 overflow-y-auto">
          {debugLog.map((msg, i) => (
            <div key={i} className="text-gray-400">{msg}</div>
          ))}
        </div>
      )}

      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Remote Video */}
        <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-2">👤</div>
                <p className="text-gray-400 text-sm">
                  {connectionState === 'waiting' ? 'Waiting for guest...' :
                   connectionState === 'connecting' ? 'Connecting...' :
                   'No video'}
                </p>
              </div>
            </div>
          )}
          {remoteStream && (
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">
              {isHost ? 'Guest' : 'Host'}
            </div>
          )}
        </div>

        {/* Local Video */}
        <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
          {isVideoOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
              <div className="text-4xl">📷</div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">
            You {isMuted && '🔇'} {isVideoOff && '📷'}
          </div>
        </div>
      </div>

      {/* Share Link (Host only, when waiting) */}
      {isHost && connectionState === 'waiting' && (
        <div className="mb-4 p-4 bg-gray-800 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Share this link with the person you want to call:</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={getJoinLink()}
              className="flex-1 bg-gray-700 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={copyLink}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                copySuccess ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {copySuccess ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Retry button when failed */}
      {connectionState === 'failed' && (
        <div className="mb-4 text-center">
          <button
            onClick={retryConnection}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-4">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'} active:scale-95 transition-transform`}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full ${isVideoOff ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'} active:scale-95 transition-transform`}
        >
          {isVideoOff ? '📷' : '🎥'}
        </button>
        <button
          onClick={endCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 transition-transform"
        >
          📞
        </button>
      </div>

      {/* Room Info */}
      <div className="mt-4 text-center text-xs text-gray-500">
        Room: {roomId} • {isHost ? 'Host' : 'Guest'} • {userLang.toUpperCase()}
      </div>
    </div>
  )
}
