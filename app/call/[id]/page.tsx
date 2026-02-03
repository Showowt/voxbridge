'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

function VideoCallContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.id as string
  
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = (searchParams.get('lang') || 'en') as 'en' | 'es'
  
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [myText, setMyText] = useState('')
  const [theirText, setTheirText] = useState('')
  const [myTranslation, setMyTranslation] = useState('')
  const [theirTranslation, setTheirTranslation] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [peerName, setPeerName] = useState('')
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const recognitionRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  
  const targetLang = userLang === 'en' ? 'es' : 'en'

  // Translate text
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang: from, targetLang: to })
      })
      const data = await res.json()
      return data.translation || text
    } catch {
      return text
    }
  }, [])

  // Start speech recognition
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = userLang === 'en' ? 'en-US' : 'es-ES'

    recognition.onresult = async (event: any) => {
      let finalText = ''
      let interimText = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript + ' '
        } else {
          interimText = transcript
        }
      }

      const displayText = finalText + interimText
      setMyText(displayText)
      
      // Translate and send
      if (finalText.trim()) {
        const translated = await translate(finalText.trim(), userLang, targetLang)
        setMyTranslation(translated)
        
        // Send to peer via data channel
        if (dataChannelRef.current?.readyState === 'open') {
          dataChannelRef.current.send(JSON.stringify({
            type: 'speech',
            text: finalText.trim(),
            translation: translated,
            lang: userLang
          }))
        }
      }
    }

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') {
        console.error('Speech error:', e.error)
      }
    }

    recognition.onend = () => {
      if (isListening) {
        recognition.start()
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [userLang, targetLang, translate, isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  // Initialize media
  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: true
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      return stream
    } catch (err) {
      console.error('Media error:', err)
      return null
    }
  }, [facingMode])

  // Setup WebRTC
  const setupPeerConnection = useCallback((stream: MediaStream) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
    
    const pc = new RTCPeerConnection(config)
    peerConnectionRef.current = pc

    // Add tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream)
    })

    // Handle remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0]
        setIsConnected(true)
      }
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          roomId
        }))
      }
    }

    // Data channel for text
    if (isHost) {
      const dc = pc.createDataChannel('chat')
      setupDataChannel(dc)
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel)
      }
    }

    return pc
  }, [roomId, isHost])

  const setupDataChannel = (dc: RTCDataChannel) => {
    dataChannelRef.current = dc
    
    dc.onopen = () => console.log('Data channel open')
    
    dc.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'speech') {
          setTheirText(data.text)
          setTheirTranslation(data.translation)
        } else if (data.type === 'name') {
          setPeerName(data.name)
        }
      } catch {}
    }
    
    // Send our name
    setTimeout(() => {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'name', name: userName }))
      }
    }, 1000)
  }

  // Signaling
  useEffect(() => {
    let mounted = true
    
    const init = async () => {
      const stream = await initMedia()
      if (!stream || !mounted) return

      const pc = setupPeerConnection(stream)
      
      // Use a simple signaling approach - we'll use local storage for demo
      // In production, use a WebSocket server
      const signalingKey = `vox_signal_${roomId}`
      
      if (isHost) {
        // Host creates offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        // Store offer
        localStorage.setItem(signalingKey, JSON.stringify({
          type: 'offer',
          sdp: offer.sdp
        }))
        
        // Poll for answer
        const pollAnswer = setInterval(async () => {
          const data = localStorage.getItem(`${signalingKey}_answer`)
          if (data) {
            const answer = JSON.parse(data)
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
            clearInterval(pollAnswer)
          }
        }, 1000)
        
        return () => clearInterval(pollAnswer)
      } else {
        // Guest waits for offer
        const pollOffer = setInterval(async () => {
          const data = localStorage.getItem(signalingKey)
          if (data) {
            const offer = JSON.parse(data)
            await pc.setRemoteDescription(new RTCSessionDescription(offer))
            
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            
            localStorage.setItem(`${signalingKey}_answer`, JSON.stringify({
              type: 'answer',
              sdp: answer.sdp
            }))
            
            clearInterval(pollOffer)
          }
        }, 1000)
        
        return () => clearInterval(pollOffer)
      }
    }
    
    init()
    
    return () => {
      mounted = false
      stopListening()
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      peerConnectionRef.current?.close()
    }
  }, [roomId, isHost, initMedia, setupPeerConnection, stopListening])

  // Toggle functions
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled
    })
    setIsMuted(!isMuted)
  }

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled
    })
    setIsVideoOff(!isVideoOff)
  }

  const flipCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newMode)
    
    // Get new stream
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
        audio: true
      })
      
      // Replace tracks
      const videoTrack = newStream.getVideoTracks()[0]
      const sender = peerConnectionRef.current?.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        sender.replaceTrack(videoTrack)
      }
      
      // Update local video
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream
      }
      localStreamRef.current = newStream
    } catch (err) {
      console.error('Flip camera error:', err)
    }
  }

  const endCall = () => {
    stopListening()
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    peerConnectionRef.current?.close()
    localStorage.removeItem(`vox_signal_${roomId}`)
    localStorage.removeItem(`vox_signal_${roomId}_answer`)
    router.push('/')
  }

  const copyJoinLink = () => {
    const url = `${window.location.origin}/?join=call&id=${roomId}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="bg-[#12121a] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📹</span>
          <div>
            <h1 className="text-white font-semibold">VoxLink Video</h1>
            <p className="text-gray-500 text-xs font-mono">{roomId}</p>
          </div>
        </div>
        <button
          onClick={copyJoinLink}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 transition"
        >
          {copied ? '✓ Copied!' : '🔗 Share'}
        </button>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Remote Video */}
        <div className="relative bg-[#1a1a2e] rounded-2xl overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover min-h-[300px]"
          />
          {!isConnected && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Waiting for {isHost ? 'guest' : 'host'}...</p>
                <p className="text-cyan-400 text-sm mt-2">Share the code: {roomId}</p>
              </div>
            </div>
          )}
          {peerName && (
            <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-lg">
              <span className="text-white text-sm">{peerName}</span>
            </div>
          )}
          
          {/* Their Translation */}
          {theirTranslation && (
            <div className="absolute bottom-16 left-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">They said:</p>
              <p className="text-cyan-400">{theirTranslation}</p>
            </div>
          )}
        </div>

        {/* Local Video */}
        <div className="relative bg-[#1a1a2e] rounded-2xl overflow-hidden">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover min-h-[300px] ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
          <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-lg">
            <span className="text-white text-sm">{userName} (You)</span>
            <span className="ml-2 text-xs">{userLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          </div>
          
          {/* My Text */}
          {myText && (
            <div className="absolute top-4 left-4 right-4 bg-black/70 backdrop-blur rounded-xl p-3">
              <p className="text-white text-sm">{myText}</p>
              {myTranslation && (
                <p className="text-cyan-400 text-xs mt-1">→ {myTranslation}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-[#12121a] border-t border-gray-800 px-4 py-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              isMuted ? 'bg-red-500 text-white' : 'bg-[#1a1a2e] text-white hover:bg-gray-700'
            }`}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              isVideoOff ? 'bg-red-500 text-white' : 'bg-[#1a1a2e] text-white hover:bg-gray-700'
            }`}
          >
            {isVideoOff ? '📵' : '📹'}
          </button>
          
          <button
            onClick={isListening ? stopListening : startListening}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition shadow-lg ${
              isListening 
                ? 'bg-green-500 text-white animate-pulse shadow-green-500/50' 
                : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/30'
            }`}
          >
            {isListening ? '⏹️' : '🎙️'}
          </button>
          
          <button
            onClick={flipCamera}
            className="w-14 h-14 rounded-full bg-[#1a1a2e] text-white flex items-center justify-center hover:bg-gray-700 transition"
          >
            🔄
          </button>
          
          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition"
          >
            📞
          </button>
        </div>
        
        <p className="text-center text-gray-500 text-xs mt-3">
          {isListening ? '🎙️ Listening... Speak now' : 'Tap 🎙️ to start translating'}
        </p>
      </div>
    </div>
  )
}

export default function VideoCallPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Connecting...</p>
        </div>
      </div>
    }>
      <VideoCallContent />
    </Suspense>
  )
}
