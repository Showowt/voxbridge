'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

export default function FaceToFace() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = searchParams.get('lang') as 'en' | 'es' || 'en'
  const partnerLang = userLang === 'en' ? 'es' : 'en'
  
  const [peer, setPeer] = useState<any>(null)
  const [conn, setConn] = useState<any>(null)
  const [status, setStatus] = useState('Initializing...')
  const [isConnected, setIsConnected] = useState(false)
  
  const [isListening, setIsListening] = useState(false)
  const [myText, setMyText] = useState('')
  const [myTranslation, setMyTranslation] = useState('')
  const [partnerText, setPartnerText] = useState('')
  const [partnerTranslation, setPartnerTranslation] = useState('')
  
  const recognitionRef = useRef<any>(null)
  const peerRef = useRef<any>(null)
  const connRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  
  useEffect(() => {
    let mounted = true
    
    const init = async () => {
      try {
        const { default: Peer } = await import('peerjs')
        
        const config = {
          host: 'voxlink-peer.herokuapp.com',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        }
        
        let p: any
        if (isHost) {
          p = new Peer(roomId, config)
          setStatus('Waiting for partner...')
        } else {
          p = new Peer(config)
          setStatus('Connecting...')
        }
        
        peerRef.current = p
        setPeer(p)
        
        p.on('open', (id: string) => {
          if (!mounted) return
          
          if (!isHost) {
            setTimeout(() => {
              if (!mounted) return
              const connection = p.connect(roomId, { reliable: true })
              setupConnection(connection)
            }, 1000)
          }
        })
        
        p.on('connection', (connection: any) => {
          if (!mounted) return
          setupConnection(connection)
        })
        
        p.on('error', (err: any) => {
          console.error('Peer error:', err)
          setStatus('Connection error')
        })
        
      } catch (err) {
        console.error('Init error:', err)
        setStatus('Failed to initialize')
      }
    }
    
    const setupConnection = (connection: any) => {
      connRef.current = connection
      setConn(connection)
      
      connection.on('open', () => {
        setStatus('Connected')
        setIsConnected(true)
      })
      
      connection.on('data', (data: any) => {
        if (data.type === 'speech') {
          setPartnerText(data.text)
        } else if (data.type === 'translation') {
          setPartnerTranslation(data.text)
        }
      })
      
      connection.on('close', () => {
        setStatus('Disconnected')
        setIsConnected(false)
      })
    }
    
    init()
    
    return () => {
      mounted = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
      }
      if (peerRef.current) {
        peerRef.current.destroy()
      }
    }
  }, [roomId, isHost])
  
  const sendToPartner = (type: string, text: string) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type, text })
    }
  }
  
  const translate = async (text: string) => {
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
      console.error('Translation error:', err)
    }
  }
  
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition requires Chrome or Edge')
      return
    }
    
    if (!isConnected) {
      alert('Wait for partner to connect')
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
      if (event.error === 'not-allowed') {
        alert('Microphone permission denied')
      }
    }
    
    recognition.onend = () => {
      if (isListening) {
        try { recognition.start() } catch {}
      }
    }
    
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }
  
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }
  
  const clearAll = () => {
    setMyText('')
    setMyTranslation('')
    finalTranscriptRef.current = ''
  }
  
  const copyJoinLink = () => {
    const link = `${window.location.origin}/talk/${roomId}?host=false&name=Partner&lang=${partnerLang}`
    navigator.clipboard.writeText(link)
    alert('Link copied!')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex flex-col">
      {/* Top Bar */}
      <div className="bg-black/40 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-white text-sm transition"
          >
            ← Back
          </button>
          
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Room Code</div>
              <div className="text-2xl font-mono font-bold text-cyan-400">{roomId}</div>
            </div>
            
            <div className="h-10 w-px bg-gray-700"></div>
            
            <div className="text-center">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Status</div>
              <div className={`text-lg font-semibold ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
                {isConnected ? '● Connected' : '○ ' + status}
              </div>
            </div>
          </div>
          
          {isHost && !isConnected && (
            <button
              onClick={copyJoinLink}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white font-semibold text-sm transition shadow-lg shadow-cyan-500/20"
            >
              📋 Copy Link
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* YOU */}
            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur rounded-3xl p-8 border-2 border-cyan-500/30 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-1">You</h2>
                  <div className="flex items-center gap-2 text-cyan-400">
                    <span className="text-4xl">{userLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                    <span className="text-xl font-medium">{userLang === 'en' ? 'English' : 'Español'}</span>
                  </div>
                </div>
                {isListening && (
                  <div className="flex items-center gap-2 bg-red-500/20 px-4 py-2 rounded-full border border-red-500">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-red-400 font-semibold">LIVE</span>
                  </div>
                )}
              </div>
              
              <div className="space-y-6">
                <div>
                  <div className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">What You Said</div>
                  <div className="bg-black/40 rounded-2xl p-6 min-h-[140px] border border-cyan-500/20">
                    <p className="text-white text-2xl leading-relaxed">
                      {myText || <span className="text-gray-600 italic text-lg">Start speaking...</span>}
                    </p>
                  </div>
                </div>
                
                <div>
                  <div className="text-sm font-semibold text-green-400 mb-3 uppercase tracking-wide">
                    Translation → {partnerLang === 'en' ? 'English' : 'Español'}
                  </div>
                  <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl p-6 min-h-[120px] border border-green-500/30">
                    <p className="text-green-100 text-xl leading-relaxed">
                      {myTranslation || <span className="text-gray-600 italic text-base">Translation appears here...</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PARTNER */}
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur rounded-3xl p-8 border-2 border-purple-500/30 shadow-2xl">
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-1">Partner</h2>
                <div className="flex items-center gap-2 text-purple-400">
                  <span className="text-4xl">{partnerLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                  <span className="text-xl font-medium">{partnerLang === 'en' ? 'English' : 'Español'}</span>
                </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <div className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">What They Said</div>
                  <div className="bg-black/40 rounded-2xl p-6 min-h-[140px] border border-purple-500/20">
                    <p className="text-white text-2xl leading-relaxed">
                      {partnerText || <span className="text-gray-600 italic text-lg">Listening...</span>}
                    </p>
                  </div>
                </div>
                
                <div>
                  <div className="text-sm font-semibold text-green-400 mb-3 uppercase tracking-wide">
                    Translation → {userLang === 'en' ? 'English' : 'Español'}
                  </div>
                  <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-2xl p-6 min-h-[120px] border border-green-500/30">
                    <p className="text-green-100 text-xl leading-relaxed">
                      {partnerTranslation || <span className="text-gray-600 italic text-base">Translation appears here...</span>}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-black/40 backdrop-blur border-t border-gray-800 px-6 py-6">
        <div className="max-w-7xl mx-auto flex justify-center gap-4">
          {!isListening ? (
            <button
              onClick={startListening}
              disabled={!isConnected}
              className={`px-12 py-5 rounded-2xl text-white text-xl font-bold transition-all shadow-2xl ${
                isConnected
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/50 hover:scale-105'
                  : 'bg-gray-700 cursor-not-allowed opacity-50'
              }`}
            >
              🎤 Start Speaking
            </button>
          ) : (
            <>
              <button
                onClick={stopListening}
                className="px-12 py-5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 rounded-2xl text-white text-xl font-bold transition-all shadow-2xl shadow-red-500/50 hover:scale-105"
              >
                ⏹️ Stop
              </button>
              <button
                onClick={clearAll}
                className="px-8 py-5 bg-gray-700 hover:bg-gray-600 rounded-2xl text-white text-lg font-semibold transition-all hover:scale-105"
              >
                🗑️ Clear
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
