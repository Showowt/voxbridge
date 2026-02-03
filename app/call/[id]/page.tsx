'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function VideoCall() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'Guest'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'
  
  const [peer, setPeer] = useState<any>(null)
  const [connectionStatus, setConnectionStatus] = useState('Connecting...')
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  
  const joinLink = `${window.location.origin}/call/${roomId}?host=false&name=Guest&lang=${userLang === 'en' ? 'es' : 'en'}`

  useEffect(() => {
    let mounted = true
    let peerInstance: any = null

    const initializePeer = async () => {
      try {
        const { default: Peer } = await import('peerjs')
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        })
        
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        
        setLocalStream(stream)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
        }

        const peerConfig = {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        }

        if (isHost) {
          peerInstance = new Peer(roomId, peerConfig)
        } else {
          peerInstance = new Peer(peerConfig)
        }

        setPeer(peerInstance)

        peerInstance.on('open', () => {
          if (!mounted) return
          if (isHost) {
            setConnectionStatus('Waiting for guest to join...')
          } else {
            setConnectionStatus('Connecting to host...')
            const call = peerInstance.call(roomId, stream)
            
            call.on('stream', (remoteStreamData: MediaStream) => {
              if (!mounted) return
              setRemoteStream(remoteStreamData)
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStreamData
              }
              setConnectionStatus('Connected')
            })
          }
        })

        peerInstance.on('call', (call: any) => {
          if (!mounted) return
          call.answer(stream)
          call.on('stream', (remoteStreamData: MediaStream) => {
            if (!mounted) return
            setRemoteStream(remoteStreamData)
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStreamData
            }
            setConnectionStatus('Connected')
          })
        })

        peerInstance.on('error', (err: Error) => {
          console.error('PeerJS error:', err)
          setConnectionStatus('Connection error')
        })

      } catch (err) {
        console.error('Media error:', err)
        setConnectionStatus('Camera/microphone access denied')
      }
    }

    initializePeer()

    return () => {
      mounted = false
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (peerInstance) {
        peerInstance.destroy()
      }
    }
  }, [roomId, isHost])

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsVideoOff(!isVideoOff)
    }
  }

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink)
      alert('Join link copied!')
    } catch {
      alert(`Join link: ${joinLink}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col p-4">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-6xl mx-auto w-full">
        <div className="relative bg-[#1a1a2e] rounded-xl overflow-hidden aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover video-mirror"
          />
          <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded text-white text-sm">
            You ({userName})
          </div>
        </div>
        
        <div className="relative bg-[#1a1a2e] rounded-xl overflow-hidden aspect-video">
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              {connectionStatus}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4 mt-6">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-700'} text-white transition`}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button
          onClick={toggleVideo}
          className={`p-4 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'} text-white transition`}
        >
          {isVideoOff ? '📷' : '📹'}
        </button>
        {isHost && (
          <button
            onClick={copyJoinLink}
            className="px-6 py-4 bg-cyan-500 hover:bg-cyan-600 rounded-full text-white transition"
          >
            📋 Copy Join Link
          </button>
        )}
        <button
          onClick={() => router.push('/')}
          className="px-6 py-4 bg-red-500 hover:bg-red-600 rounded-full text-white transition"
        >
          ❌ End Call
        </button>
      </div>
    </div>
  )
}
