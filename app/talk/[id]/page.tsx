'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

// Translation cache
const cache = new Map<string, string>()

interface Message {
  id: string
  side: 'left' | 'right'
  original: string
  translated: string
  lang: 'en' | 'es'
}

export default function FaceToFaceTalk() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const initialSide = searchParams.get('side') as 'left' | 'right' || 'left'

  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [leftLang, setLeftLang] = useState<'en' | 'es'>('en')
  const [rightLang, setRightLang] = useState<'en' | 'es'>('es')
  const [activeSide, setActiveSide] = useState<'left' | 'right' | null>(null)
  const [liveText, setLiveText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Refs
  const recRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Ultra-fast translation
  const translate = useCallback(async (text: string, from: string, to: string): Promise<string> => {
    if (!text.trim() || from === to) return text
    const key = `${from}>${to}:${text.trim().toLowerCase()}`
    if (cache.has(key)) return cache.get(key)!
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`)
      const d = await r.json()
      const t = d.responseData?.translatedText || text
      cache.set(key, t)
      return t
    } catch { return text }
  }, [])

  // Add message
  const addMessage = useCallback(async (text: string, side: 'left' | 'right') => {
    if (!text.trim()) return

    const fromLang = side === 'left' ? leftLang : rightLang
    const toLang = side === 'left' ? rightLang : leftLang
    const translated = await translate(text, fromLang, toLang)

    const msg: Message = {
      id: Date.now().toString(),
      side,
      original: text,
      translated,
      lang: fromLang
    }

    setMessages(prev => [...prev, msg])
  }, [leftLang, rightLang, translate])

  // Setup speech recognition for a side
  const setupSpeech = useCallback((side: 'left' | 'right') => {
    if (typeof window === 'undefined') return null

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return null

    const lang = side === 'left' ? leftLang : rightLang
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = lang === 'en' ? 'en-US' : 'es-ES'

    rec.onstart = () => {
      setIsListening(true)
      setActiveSide(side)
    }

    rec.onend = () => {
      setIsListening(false)
      setActiveSide(null)
      setLiveText('')
    }

    rec.onerror = () => {
      setIsListening(false)
      setActiveSide(null)
    }

    rec.onresult = (e: any) => {
      let interim = '', final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setLiveText(interim)
      if (final) {
        setLiveText('')
        addMessage(final, side)
      }
    }

    return rec
  }, [leftLang, rightLang, addMessage])

  // Start listening for a side
  const startListening = useCallback((side: 'left' | 'right') => {
    // Stop any existing recognition
    if (recRef.current) {
      try { recRef.current.stop() } catch {}
    }

    const rec = setupSpeech(side)
    if (rec) {
      recRef.current = rec
      try { rec.start() } catch {}
    }
  }, [setupSpeech])

  // Stop listening
  const stopListening = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop() } catch {}
    }
    setIsListening(false)
    setActiveSide(null)
    setLiveText('')
  }, [])

  // Swap languages
  const swapLanguages = useCallback(() => {
    setLeftLang(rightLang)
    setRightLang(leftLang)
  }, [leftLang, rightLang])

  // Cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (recRef.current) try { recRef.current.stop() } catch {}
    }
  }, [])

  const goHome = () => {
    stopListening()
    router.push('/')
  }

  const clearMessages = () => {
    setMessages([])
    setShowSettings(false)
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-gray-900 via-gray-900 to-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <button onClick={goHome} className="text-white/70 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-white font-semibold">Face to Face</h1>
        <button onClick={() => setShowSettings(!showSettings)} className="text-white/70 hover:text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <div className="absolute top-14 right-4 bg-gray-800 rounded-xl shadow-xl border border-white/10 overflow-hidden z-50">
          <button
            onClick={swapLanguages}
            className="flex items-center gap-3 px-4 py-3 text-white text-sm hover:bg-white/10 w-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Swap Languages
          </button>
          <button
            onClick={clearMessages}
            className="flex items-center gap-3 px-4 py-3 text-red-400 text-sm hover:bg-white/10 w-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Conversation
          </button>
        </div>
      )}

      {/* Language indicators */}
      <div className="flex justify-between items-center px-4 py-3 bg-black/30">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{leftLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="text-white font-medium">{leftLang === 'en' ? 'English' : 'Español'}</span>
        </div>
        <button onClick={swapLanguages} className="bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{rightLang === 'en' ? 'English' : 'Español'}</span>
          <span className="text-2xl">{rightLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">Ready to Translate</h2>
            <p className="text-white/60 text-sm max-w-xs">
              Tap and hold either button below to speak. Your words will be translated instantly for the other person.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.side === 'right' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.side === 'left'
                  ? 'bg-blue-500 text-white rounded-bl-none'
                  : 'bg-emerald-500 text-white rounded-br-none'
              }`}
            >
              <p className="text-base font-medium">{msg.original}</p>
              <div className={`mt-2 pt-2 border-t ${msg.side === 'left' ? 'border-blue-400/50' : 'border-emerald-400/50'}`}>
                <p className="text-sm opacity-90">{msg.translated}</p>
              </div>
              <p className="text-xs opacity-60 mt-1">
                {msg.lang === 'en' ? '🇺🇸' : '🇪🇸'} → {msg.lang === 'en' ? '🇪🇸' : '🇺🇸'}
              </p>
            </div>
          </div>
        ))}

        {/* Live transcription */}
        {liveText && activeSide && (
          <div className={`flex ${activeSide === 'right' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                activeSide === 'left'
                  ? 'bg-blue-500/60 text-white rounded-bl-none'
                  : 'bg-emerald-500/60 text-white rounded-br-none'
              }`}
            >
              <p className="text-base">{liveText}</p>
              <p className="text-xs opacity-60 mt-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                Listening...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom buttons - Two large push-to-talk buttons */}
      <div className="p-4 pb-8 bg-gradient-to-t from-black to-transparent">
        <div className="flex gap-4">
          {/* Left side button */}
          <button
            onTouchStart={() => startListening('left')}
            onTouchEnd={stopListening}
            onMouseDown={() => startListening('left')}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            className={`flex-1 py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
              activeSide === 'left'
                ? 'bg-blue-500 shadow-lg shadow-blue-500/50'
                : 'bg-blue-500/20 hover:bg-blue-500/30'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              activeSide === 'left' ? 'bg-white/20 animate-pulse' : 'bg-white/10'
            }`}>
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            </div>
            <span className="text-white font-medium text-sm">
              {leftLang === 'en' ? '🇺🇸 English' : '🇪🇸 Español'}
            </span>
            <span className="text-white/50 text-xs">
              {activeSide === 'left' ? 'Release to send' : 'Hold to speak'}
            </span>
          </button>

          {/* Right side button */}
          <button
            onTouchStart={() => startListening('right')}
            onTouchEnd={stopListening}
            onMouseDown={() => startListening('right')}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            className={`flex-1 py-6 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
              activeSide === 'right'
                ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              activeSide === 'right' ? 'bg-white/20 animate-pulse' : 'bg-white/10'
            }`}>
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V21h2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
              </svg>
            </div>
            <span className="text-white font-medium text-sm">
              {rightLang === 'en' ? '🇺🇸 English' : '🇪🇸 Español'}
            </span>
            <span className="text-white/50 text-xs">
              {activeSide === 'right' ? 'Release to send' : 'Hold to speak'}
            </span>
          </button>
        </div>

        {/* Instructions */}
        <p className="text-center text-white/40 text-xs mt-4">
          Place device between you • Each person taps their side to speak
        </p>
      </div>
    </div>
  )
}
