'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════════════════════
// VOXNOTE COMPONENT - WhatsApp Voice Message Translator
// Fixed: Stale closure bug, cleanup on unmount, same language prevention
// ═══════════════════════════════════════════════════════════════════════════════

function VoxNoteTab() {
  // Language state - default: Spanish → English (most common for WhatsApp voice msgs)
  const [sourceLang, setSourceLang] = useState<'en' | 'es'>('es')
  const [targetLang, setTargetLang] = useState<'en' | 'es'>('en')
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  
  // Text state
  const [originalText, setOriginalText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [interimText, setInterimText] = useState('')
  
  // UI state
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'original' | 'translated' | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  // Refs to avoid stale closures
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isRecordingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  
  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // Check online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
        recognitionRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      speechSynthesis.cancel()
    }
  }, [])

  // Auto-sync languages to prevent same source/target
  useEffect(() => {
    if (sourceLang === targetLang) {
      setTargetLang(sourceLang === 'en' ? 'es' : 'en')
    }
  }, [sourceLang, targetLang])

  // Swap languages
  const swapLanguages = useCallback(() => {
    const newSource = targetLang
    const newTarget = sourceLang
    setSourceLang(newSource)
    setTargetLang(newTarget)
    
    // Also swap the text if both exist
    if (originalText && translatedText) {
      setOriginalText(translatedText)
      setTranslatedText(originalText)
    }
  }, [sourceLang, targetLang, originalText, translatedText])

  // Translate text via API
  const translateText = useCallback(async (text: string) => {
    if (!text.trim()) return
    
    setIsProcessing(true)
    setError('')
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          sourceLang,
          targetLang
        })
      })
      
      if (!response.ok) {
        throw new Error('Translation failed')
      }
      
      const data = await response.json()
      if (data.translation) {
        setTranslatedText(data.translation)
      } else if (data.error) {
        setError(data.error)
      } else {
        setError('Translation failed. Please try again.')
      }
    } catch (err) {
      console.error('Translation error:', err)
      setError('Translation failed. Check your connection.')
    } finally {
      setIsProcessing(false)
    }
  }, [sourceLang, targetLang])

  // Start recording
  const startRecording = useCallback(() => {
    // Reset state
    setError('')
    setOriginalText('')
    setTranslatedText('')
    setInterimText('')
    setRecordingTime(0)
    finalTranscriptRef.current = ''
    
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported. Please use Chrome or Edge.')
      return
    }

    // Check online
    if (!navigator.onLine) {
      setError('No internet connection. Speech recognition requires internet.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = sourceLang === 'en' ? 'en-US' : 'es-ES'
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript + ' '
        } else {
          interim = transcript
        }
      }
      
      if (final) {
        finalTranscriptRef.current += final
        setOriginalText(finalTranscriptRef.current)
      }
      setInterimText(interim)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      
      switch (event.error) {
        case 'no-speech':
          setError('No speech detected. Please try again.')
          break
        case 'audio-capture':
          setError('No microphone found. Please check your device.')
          break
        case 'not-allowed':
          setError('Microphone access denied. Please allow microphone access.')
          break
        case 'network':
          setError('Network error. Please check your connection.')
          break
        default:
          setError(`Error: ${event.error}`)
      }
      
      stopRecording()
    }

    recognition.onend = () => {
      // Use ref to check current state (fixes stale closure)
      if (isRecordingRef.current) {
        // Recognition ended but we're still recording - restart it
        try {
          recognition.start()
        } catch {}
      } else {
        // We intentionally stopped - translate what we have
        const textToTranslate = finalTranscriptRef.current.trim()
        if (textToTranslate) {
          translateText(textToTranslate)
        }
      }
    }

    // Start recognition
    try {
      recognitionRef.current = recognition
      recognition.start()
      setIsRecording(true)
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (err) {
      setError('Could not start recording. Please try again.')
    }
  }, [sourceLang, translateText])

  // Stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setInterimText('')
    
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
  }, [])

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'original' | 'translated') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  // Speak translation
  const speakTranslation = () => {
    if (!translatedText || isSpeaking) return
    
    // Cancel any ongoing speech
    speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(translatedText)
    utterance.lang = targetLang === 'en' ? 'en-US' : 'es-ES'
    utterance.rate = 0.9
    utterance.pitch = 1
    
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    
    speechSynthesis.speak(utterance)
  }

  // Share translation (native share or WhatsApp fallback)
  const shareTranslation = async () => {
    const shareText = `${originalText}\n\n➡️ Translation:\n${translatedText}`
    
    // Try native Web Share API first (works great on mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'VoxLink Translation',
          text: shareText
        })
        return
      } catch (err) {
        // User cancelled or share failed - fall through to WhatsApp
        if ((err as Error).name === 'AbortError') return
      }
    }
    
    // Fallback: Open WhatsApp with pre-filled text
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
    window.open(whatsappUrl, '_blank')
  }

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Clear all
  const clearAll = () => {
    setOriginalText('')
    setTranslatedText('')
    setInterimText('')
    setError('')
    setRecordingTime(0)
    finalTranscriptRef.current = ''
    speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  // Display text (original + interim while recording)
  const displayText = originalText + (interimText ? (originalText ? ' ' : '') + interimText : '')

  // Check for browser support
  const [browserSupported, setBrowserSupported] = useState(true)
  
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setBrowserSupported(!!SpeechRecognition)
  }, [])

  return (
    <div className="space-y-4">
      {/* Browser Compatibility Warning */}
      {!browserSupported && (
        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm text-center">
          ⚠️ Speech recognition requires Chrome or Edge browser. Safari and Firefox are not supported.
        </div>
      )}
      
      {/* Offline Warning */}
      {!isOnline && (
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm text-center">
          ⚠️ You're offline. Translation requires internet.
        </div>
      )}

      {/* Language Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSourceLang(sourceLang === 'en' ? 'es' : 'en')}
          disabled={isRecording}
          className={`flex-1 p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-2 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'
          }`}
        >
          <span className="text-xl">{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium">{sourceLang === 'en' ? 'English' : 'Español'}</span>
        </button>
        
        <button
          onClick={swapLanguages}
          disabled={isRecording}
          className={`p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-green-400 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-500/10 hover:border-green-500/50'
          }`}
        >
          ⇄
        </button>
        
        <button
          onClick={() => setTargetLang(targetLang === 'en' ? 'es' : 'en')}
          disabled={isRecording}
          className={`flex-1 p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-2 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'
          }`}
        >
          <span className="text-xl">{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium">{targetLang === 'en' ? 'English' : 'Español'}</span>
        </button>
      </div>

      {/* Recording Button */}
      <div className="flex flex-col items-center py-6">
        <button
          onClick={toggleRecording}
          disabled={isProcessing || !isOnline || !browserSupported}
          className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isProcessing || !browserSupported
              ? 'bg-gray-600 cursor-not-allowed'
              : isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/50'
                : 'bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/30 hover:shadow-green-500/50'
          }`}
          style={isRecording ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}
        >
          {isProcessing ? (
            <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          ) : isRecording ? (
            <div className="w-10 h-10 bg-white rounded-md" />
          ) : (
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
            </svg>
          )}
        </button>
        
        {/* Recording indicator */}
        {isRecording && (
          <div className="mt-4 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-red-400 font-mono text-lg">{formatTime(recordingTime)}</span>
          </div>
        )}
        
        <p className="text-gray-500 text-sm mt-3">
          {!browserSupported
            ? 'Use Chrome or Edge browser'
            : isProcessing 
              ? 'Translating...' 
              : isRecording 
                ? 'Tap to stop recording' 
                : 'Tap to record voice message'
          }
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Original Text */}
      {displayText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <span>{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
              Original ({sourceLang === 'en' ? 'English' : 'Español'})
              {isRecording && <span className="text-green-400 text-xs">(listening...)</span>}
            </span>
            {originalText && !isRecording && (
              <button
                onClick={() => copyToClipboard(originalText, 'original')}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                {copied === 'original' ? '✓ Copied!' : '📋 Copy'}
              </button>
            )}
          </div>
          <div className={`p-4 rounded-xl bg-[#1a1a2e] border text-white min-h-[60px] ${
            isRecording ? 'border-green-500/50' : 'border-gray-700'
          }`}>
            {displayText}
            {isRecording && <span className="animate-pulse">|</span>}
          </div>
        </div>
      )}

      {/* Translated Text */}
      {translatedText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <span>{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
              Translation ({targetLang === 'en' ? 'English' : 'Español'})
            </span>
            <div className="flex gap-3">
              <button
                onClick={speakTranslation}
                disabled={isSpeaking}
                className={`text-xs transition ${
                  isSpeaking ? 'text-green-400' : 'text-cyan-400 hover:text-cyan-300'
                }`}
              >
                {isSpeaking ? '🔊 Playing...' : '🔊 Listen'}
              </button>
              <button
                onClick={() => copyToClipboard(translatedText, 'translated')}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                {copied === 'translated' ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 text-green-100 min-h-[60px]">
            {translatedText}
          </div>
        </div>
      )}

      {/* Action Buttons - Always Visible */}
      <div className="flex gap-3">
        <button
          onClick={shareTranslation}
          disabled={!translatedText || isRecording}
          className={`flex-1 py-3 rounded-xl border transition flex items-center justify-center gap-2 ${
            translatedText && !isRecording
              ? 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
              : 'bg-[#1a1a2e] border-gray-700 text-gray-600 cursor-not-allowed'
          }`}
        >
          📤 Share
        </button>
        <button
          onClick={clearAll}
          disabled={(!originalText && !translatedText) || isRecording}
          className={`flex-1 py-3 rounded-xl border transition flex items-center justify-center gap-2 ${
            (originalText || translatedText) && !isRecording
              ? 'bg-[#1a1a2e] border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              : 'bg-[#1a1a2e] border-gray-700 text-gray-600 cursor-not-allowed'
          }`}
        >
          🗑️ Clear
        </button>
      </div>

      {/* WhatsApp Tip */}
      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
        <p className="text-green-400 text-sm font-medium flex items-center gap-2">
          <span className="text-lg">💡</span> WhatsApp Voice Message Tip
        </p>
        <p className="text-gray-400 text-xs mt-2 leading-relaxed">
          Play the WhatsApp voice message out loud on speaker, then tap the record button here to translate it instantly!
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HOME CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Check for join links
  const joinType = searchParams.get('join')
  const joinId = searchParams.get('id')
  
  // Form state
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [joinCode, setJoinCode] = useState('')
  const [activeTab, setActiveTab] = useState<'video' | 'talk' | 'voxnote'>('voxnote')
  const [mode, setMode] = useState<'start' | 'join'>('start')
  const [isJoining, setIsJoining] = useState(false)

  // Load saved preferences
  useEffect(() => {
    const savedName = localStorage.getItem('voxlink_name')
    const savedLang = localStorage.getItem('voxlink_lang') as 'en' | 'es'
    if (savedName) setName(savedName)
    if (savedLang) setLanguage(savedLang)
    
    // Handle join links
    if (joinType && joinId) {
      setIsJoining(true)
      setJoinCode(joinId.toUpperCase())
      setActiveTab(joinType === 'talk' ? 'talk' : 'video')
      setMode('join')
    }
  }, [joinType, joinId])

  // Save preferences
  useEffect(() => {
    if (name) localStorage.setItem('voxlink_name', name)
    if (language) localStorage.setItem('voxlink_lang', language)
  }, [name, language])

  // Generate room code
  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  // Start Video Call
  const startVideoCall = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    const code = generateCode()
    router.push(`/call/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Join Video Call
  const joinVideoCall = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert('Please enter a valid code')
      return
    }
    router.push(`/call/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Start Talk Mode
  const startTalkMode = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    const code = generateCode()
    router.push(`/talk/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Join Talk Mode
  const joinTalkMode = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert('Please enter a valid code')
      return
    }
    router.push(`/talk/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Joining screen
  if (isJoining && joinId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
            <div className="text-center mb-6">
              <span className="text-4xl">{joinType === 'talk' ? '💬' : '📹'}</span>
              <h2 className="text-xl font-bold text-white mt-3">
                Join {joinType === 'talk' ? 'Conversation' : 'Video Call'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">Code: <span className="font-mono text-cyan-400">{joinId}</span></p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">You Speak</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                      language === 'en'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    <span className="text-xl">🇺🇸</span>
                    <span>English</span>
                  </button>
                  <button
                    onClick={() => setLanguage('es')}
                    className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                      language === 'es'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    <span className="text-xl">🇪🇸</span>
                    <span>Español</span>
                  </button>
                </div>
              </div>
              
              <button
                onClick={joinType === 'talk' ? joinTalkMode : joinVideoCall}
                className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
              >
                {joinType === 'talk' ? '💬 Join / Unirse' : '📹 Join / Unirse'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-3 shadow-lg shadow-cyan-500/25">
            <span className="text-3xl">🔗</span>
          </div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-sm font-medium text-cyan-400 tracking-wider">MACHINEMIND</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">VoxLink™</h1>
          <p className="text-gray-400 text-sm">Break Language Barriers Instantly</p>
        </div>

        {/* Card */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
          {/* Mode Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('video')}
              className={`flex-1 py-3 text-center font-medium transition text-sm ${
                activeTab === 'video'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📹 Video
            </button>
            <button
              onClick={() => setActiveTab('talk')}
              className={`flex-1 py-3 text-center font-medium transition text-sm ${
                activeTab === 'talk'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💬 Face
            </button>
            <button
              onClick={() => setActiveTab('voxnote')}
              className={`flex-1 py-3 text-center font-medium transition text-sm ${
                activeTab === 'voxnote'
                  ? 'text-green-400 border-b-2 border-green-400 bg-green-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎤 VoxNote
            </button>
          </div>

          <div className="p-5">
            {/* VoxNote Tab */}
            {activeTab === 'voxnote' ? (
              <VoxNoteTab />
            ) : (
              <>
                {/* Description */}
                <div className="mb-5 p-3 rounded-xl bg-gray-800/50 text-center">
                  {activeTab === 'video' ? (
                    <p className="text-gray-300 text-sm">
                      <span className="text-cyan-400 font-medium">Video Call:</span> Remote calls with live translation
                    </p>
                  ) : (
                    <p className="text-gray-300 text-sm">
                      <span className="text-cyan-400 font-medium">Face-to-Face:</span> Sit with someone, each uses their phone
                    </p>
                  )}
                </div>

                {/* Name */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition text-lg"
                  />
                </div>

                {/* Language */}
                <div className="mb-5">
                  <label className="block text-sm text-gray-400 mb-2">You Speak</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                        language === 'en'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                      }`}
                    >
                      <span className="text-xl">🇺🇸</span>
                      <span className="font-medium">English</span>
                    </button>
                    <button
                      onClick={() => setLanguage('es')}
                      className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                        language === 'es'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                      }`}
                    >
                      <span className="text-xl">🇪🇸</span>
                      <span className="font-medium">Spanish</span>
                    </button>
                  </div>
                </div>

                {/* Start/Join Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setMode('start')}
                    className={`flex-1 py-2 rounded-lg font-medium transition ${
                      mode === 'start' ? 'bg-cyan-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    Start New
                  </button>
                  <button
                    onClick={() => setMode('join')}
                    className={`flex-1 py-2 rounded-lg font-medium transition ${
                      mode === 'join' ? 'bg-cyan-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    Join
                  </button>
                </div>

                {/* Action */}
                {mode === 'start' ? (
                  <button
                    onClick={activeTab === 'video' ? startVideoCall : startTalkMode}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
                  >
                    {activeTab === 'video' ? '📹 Start Video Call' : '💬 Start Conversation'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      maxLength={6}
                      className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition uppercase font-mono"
                    />
                    <button
                      onClick={activeTab === 'video' ? joinVideoCall : joinTalkMode}
                      className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-blue-500/25"
                    >
                      {activeTab === 'video' ? '📹 Join Call' : '💬 Join Conversation'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 space-y-2">
          <p className="text-gray-500 text-xs">
            Works best in Chrome • Microphone required
          </p>
          <div className="pt-2 border-t border-gray-800">
            <a 
              href="https://machinemindconsulting.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 transition"
            >
              <span>Powered by</span>
              <span className="font-semibold text-cyan-500">MachineMind</span>
            </a>
            <p className="text-[10px] text-gray-600 mt-1">
              Need AI for your business? <a href="https://machinemindconsulting.com" target="_blank" rel="noopener noreferrer" className="text-cyan-500 hover:underline">Let&apos;s talk →</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading VoxLink...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
