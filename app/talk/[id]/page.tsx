'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'

function TalkContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.id as string
  
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = (searchParams.get('lang') || 'en') as 'en' | 'es'
  
  // State
  const [isListening, setIsListening] = useState(false)
  const [currentText, setCurrentText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<Array<{
    id: string
    speaker: string
    original: string
    translation: string
    lang: 'en' | 'es'
    isMe: boolean
    timestamp: number
  }>>([])
  const [partnerConnected, setPartnerConnected] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false) // Fix for stale closure
  const historyRef = useRef<HTMLDivElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  const targetLang = userLang === 'en' ? 'es' : 'en'

  // Keep ref in sync
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // Translate text using our API
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

  // Storage key for this room
  const storageKey = `vox_talk_${roomId}`
  const presenceKey = `vox_presence_${roomId}`

  // Announce presence
  useEffect(() => {
    const announce = () => {
      const presence = JSON.parse(localStorage.getItem(presenceKey) || '{}')
      presence[userName] = {
        name: userName,
        lang: userLang,
        lastSeen: Date.now()
      }
      localStorage.setItem(presenceKey, JSON.stringify(presence))
    }
    
    announce()
    const interval = setInterval(announce, 2000)
    
    return () => {
      clearInterval(interval)
      // Remove self from presence on unmount
      try {
        const presence = JSON.parse(localStorage.getItem(presenceKey) || '{}')
        delete presence[userName]
        localStorage.setItem(presenceKey, JSON.stringify(presence))
      } catch {}
    }
  }, [presenceKey, userName, userLang])

  // Check for partner
  useEffect(() => {
    const checkPresence = () => {
      try {
        const presence = JSON.parse(localStorage.getItem(presenceKey) || '{}')
        const others = Object.values(presence).filter((p: any) => 
          p.name !== userName && Date.now() - p.lastSeen < 5000
        ) as any[]
        
        if (others.length > 0) {
          setPartnerConnected(true)
          setPartnerName(others[0].name)
        } else {
          setPartnerConnected(false)
          setPartnerName('')
        }
      } catch {}
    }
    
    checkPresence()
    const interval = setInterval(checkPresence, 1000)
    return () => clearInterval(interval)
  }, [presenceKey, userName])

  // Poll for partner's messages
  useEffect(() => {
    const poll = () => {
      try {
        const data = localStorage.getItem(storageKey)
        if (data) {
          const messages = JSON.parse(data) as any[]
          // Get messages we don't have yet
          const newMessages = messages.filter(m => 
            !history.some(h => h.id === m.id) && m.speaker !== userName
          )
          if (newMessages.length > 0) {
            setHistory(h => [...h, ...newMessages.map(m => ({ ...m, isMe: false }))])
          }
        }
      } catch {}
    }
    
    pollIntervalRef.current = setInterval(poll, 300)
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [storageKey, userName, history])

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight
    }
  }, [history])

  // Start listening
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition not supported. Please use Chrome.')
      return
    }

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
          finalText += transcript
        } else {
          interimText = transcript
        }
      }

      // Show interim results
      setCurrentText(finalText || interimText)
      
      // When we get final text, translate and add to history
      if (finalText.trim()) {
        const translated = await translate(finalText.trim(), userLang, targetLang)
        setTranslatedText(translated)
        
        const newMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          speaker: userName,
          original: finalText.trim(),
          translation: translated,
          lang: userLang,
          isMe: true,
          timestamp: Date.now()
        }
        
        setHistory(h => [...h, newMessage])
        
        // Store for partner
        try {
          const existing = JSON.parse(localStorage.getItem(storageKey) || '[]')
          existing.push(newMessage)
          // Keep last 50 messages
          localStorage.setItem(storageKey, JSON.stringify(existing.slice(-50)))
        } catch {}
        
        // Clear current text
        setCurrentText('')
        setTranslatedText('')
      }
    }

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech error:', e.error)
      }
    }

    recognition.onend = () => {
      // Use ref to check current state (avoids stale closure)
      if (isListeningRef.current) {
        try {
          recognition.start()
        } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [userLang, targetLang, translate, userName, storageKey])

  // Stop listening
  const stopListening = useCallback(() => {
    setIsListening(false)
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
  }, [])

  // Toggle listening
  const toggleListening = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  // Copy join link
  const copyJoinLink = () => {
    const url = `${window.location.origin}/?join=talk&id=${roomId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // End session
  const endSession = () => {
    stopListening()
    localStorage.removeItem(storageKey)
    localStorage.removeItem(presenceKey)
    router.push('/')
  }

  // Speak text
  const speak = (text: string, lang: 'en' | 'es') => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang === 'en' ? 'en-US' : 'es-ES'
    utterance.rate = 0.9
    speechSynthesis.speak(utterance)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="bg-[#12121a] border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h1 className="text-white font-semibold">Face-to-Face</h1>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs font-mono">{roomId}</span>
              {partnerConnected ? (
                <span className="text-green-400 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  {partnerName} connected
                </span>
              ) : (
                <span className="text-yellow-400 text-xs">Waiting for partner...</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={copyJoinLink}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg text-sm hover:bg-cyan-500/30 transition"
        >
          {copied ? '✓ Copied!' : '🔗 Share'}
        </button>
      </div>

      {/* Your Language Indicator */}
      <div className="bg-[#1a1a2e] px-4 py-2 border-b border-gray-800 flex items-center justify-center gap-2">
        <span className="text-2xl">{userLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
        <span className="text-white font-medium">{userName}</span>
        <span className="text-gray-400 text-sm">
          speaks {userLang === 'en' ? 'English' : 'Español'}
        </span>
      </div>

      {/* Conversation History */}
      <div 
        ref={historyRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {history.length === 0 && !currentText && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🗣️</div>
            <p className="text-gray-400">Tap the microphone and start speaking</p>
            <p className="text-gray-500 text-sm mt-2">
              Your words will be translated instantly
            </p>
          </div>
        )}

        {history.map((msg) => (
          <div
            key={msg.id}
            className={`max-w-[85%] ${msg.isMe ? 'ml-auto' : 'mr-auto'}`}
          >
            <div className={`rounded-2xl p-4 ${
              msg.isMe 
                ? 'bg-cyan-500/20 border border-cyan-500/30' 
                : 'bg-purple-500/20 border border-purple-500/30'
            }`}>
              {/* Original */}
              <div className="flex items-start justify-between gap-2">
                <p className={`${msg.isMe ? 'text-cyan-100' : 'text-purple-100'}`}>
                  {msg.original}
                </p>
                <button
                  onClick={() => speak(msg.original, msg.lang)}
                  className="text-gray-400 hover:text-white shrink-0"
                >
                  🔊
                </button>
              </div>
              
              {/* Translation */}
              <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-start justify-between gap-2">
                <p className={`text-sm ${msg.isMe ? 'text-cyan-300' : 'text-purple-300'}`}>
                  → {msg.translation}
                </p>
                <button
                  onClick={() => speak(msg.translation, msg.lang === 'en' ? 'es' : 'en')}
                  className="text-gray-400 hover:text-white shrink-0 text-sm"
                >
                  🔊
                </button>
              </div>
              
              {/* Speaker */}
              <p className="text-xs text-gray-500 mt-2">
                {msg.isMe ? 'You' : msg.speaker} • {msg.lang === 'en' ? '🇺🇸' : '🇪🇸'}
              </p>
            </div>
          </div>
        ))}

        {/* Current speech in progress */}
        {currentText && (
          <div className="max-w-[85%] ml-auto">
            <div className="rounded-2xl p-4 bg-cyan-500/10 border border-cyan-500/20 border-dashed">
              <p className="text-cyan-200">{currentText}</p>
              {translatedText && (
                <p className="text-cyan-400 text-sm mt-2">→ {translatedText}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                <span className="text-xs text-gray-500">Listening...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-[#12121a] border-t border-gray-800 px-4 py-6">
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={endSession}
            className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition"
          >
            ✕
          </button>
          
          <button
            onClick={toggleListening}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isListening 
                ? 'bg-red-500 text-white animate-pulse shadow-red-500/50' 
                : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-cyan-500/30 hover:shadow-cyan-500/50'
            }`}
          >
            {isListening ? (
              <div className="w-8 h-8 bg-white rounded-sm" />
            ) : (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
              </svg>
            )}
          </button>
          
          <button
            onClick={() => setHistory([])}
            className="w-14 h-14 rounded-full bg-gray-700/50 text-gray-400 flex items-center justify-center hover:bg-gray-700 transition"
          >
            🗑️
          </button>
        </div>
        
        <p className="text-center text-gray-500 text-sm mt-4">
          {isListening ? '🎙️ Listening... Speak now' : 'Tap microphone to speak'}
        </p>
      </div>
    </div>
  )
}

export default function TalkPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <TalkContent />
    </Suspense>
  )
}
