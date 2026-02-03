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
  
  // Connection state
  const [peer, setPeer] = useState<any>(null)
  const [conn, setConn] = useState<any>(null)
  const [status, setStatus] = useState('Initializing...')
  const [isConnected, setIsConnected] = useState(false)
  
  // Speech state
  const [isListening, setIsListening] = useState(false)
  const [myText, setMyText] = useState('')
  const [myTranslation, setMyTranslation] = useState('')
  const [partnerText, setPartnerText] = useState('')
  const [partnerTranslation, setPartnerTranslation] = useState('')
  
  // Refs
  const recognitionRef = useRef<any>(null)
  const peerRef = useRef<any>(null)
  const connRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  
  // Initialize PeerJS connection
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
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        }
        
        let p: any
        if (isHost) {
          p = new Peer(roomId, config)
          setStatus('Waiting for partner...')
        } else {
          p = new Peer(config)
          setStatus('Connecting to partner...')
        }
        
        peerRef.current = p
        setPeer(p)
        
        p.on('open', (id: string) => {
          if (!mounted) return
          console.log('Peer connected with ID:', id)
          
          if (!isHost) {
            setTimeout(() => {
              if (!mounted) return
              console.log('Guest connecting to host:', roomId)
              const connection = p.connect(roomId, { reliable: true })
              setupConnection(connection)
            }, 1000)
          }
        })
        
        p.on('connection', (connection: any) => {
          if (!mounted) return
          console.log('Incoming connection from peer')
          setupConnection(connection)
        })
        
        p.on('error', (err: any) => {
          console.error('Peer error:', err)
          setStatus(`Error: ${err.type}`)
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
        console.log('Data connection open')
        setStatus('Connected ✓')
        setIsConnected(true)
      })
      
      connection.on('data', (data: any) => {
        console.log('Received data:', data)
        if (data.type === 'speech') {
          setPartnerText(data.text)
        } else if (data.type === 'translation') {
          setPartnerTranslation(data.text)
        }
      })
      
      connection.on('close', () => {
        console.log('Connection closed')
        setStatus('Disconnected')
        setIsConnected(false)
      })
      
      connection.on('error', (err: any) => {
        console.error('Connection error:', err)
        setStatus('Connection error')
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
  
  // Send data to partner
  const sendToPartner = (type: string, text: string) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type, text })
      console.log('Sent:', type, text.substring(0, 50))
    }
  }
  
  // Translate text
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
  
  // Start listening
  const startListening = () => {
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
      console.error('Speech error:', event.error)
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
    navigator.clipboard.writeText(link).then(() => {
      alert('Join link copied to clipboard!')
    }).catch(() => {
      prompt('Copy this link:', link)
    })
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
            <div className="text-sm text-gray-500">Room: {roomId}</div>
            <div className={`text-lg font-semibold ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
              {status}
            </div>
          </div>
          
          {isHost && !isConnected && (
            <button
              onClick={copyJoinLink}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white transition"
            >
              📋 Copy Link
            </button>
          )}
        </div>
      </div>

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
                {partnerText || <span className="text-gray-600 italic">Waiting for partner...</span>}
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
      </div>
    </div>
  )
}
