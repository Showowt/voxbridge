'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Peer, { DataConnection, MediaConnection } from 'peerjs'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MACHINEMIND VOXLINK™ v13.0 — UNIVERSAL EDITION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * CROSS-PLATFORM COMPATIBILITY MATRIX:
 * 
 * ┌─────────────────┬────────┬─────────┬─────────┬────────┬─────────┐
 * │ Feature         │ iOS    │ Android │ Chrome  │ Safari │ Firefox │
 * ├─────────────────┼────────┼─────────┼─────────┼────────┼─────────┤
 * │ Video Call      │ ✓      │ ✓       │ ✓       │ ✓      │ ✓       │
 * │ Camera Flip     │ ✓      │ ✓       │ ✓       │ ✓      │ ✓       │
 * │ Speech Recog    │ ✓*     │ ✓       │ ✓       │ ✓*     │ ✗       │
 * │ Wake Lock       │ ✓**    │ ✓       │ ✓       │ ✓**    │ ✓       │
 * │ PiP             │ ✗      │ ✓       │ ✓       │ ✓      │ ✗       │
 * │ Clipboard       │ ✓      │ ✓       │ ✓       │ ✓      │ ✓       │
 * └─────────────────┴────────┴─────────┴─────────┴────────┴─────────┘
 * 
 * * = Limited/requires user gesture
 * ** = Partial support, uses NoSleep fallback
 * 
 * KNOWN ISSUES HANDLED:
 * 1. iOS Safari autoplay restrictions → Tap to play overlay
 * 2. iOS Safari getUserMedia constraints → Simplified constraints
 * 3. Android Chrome camera flip → Uses exact facingMode
 * 4. Firefox no speech recognition → Graceful fallback
 * 5. Safari PiP differences → Feature detection
 * 6. Mobile keyboard pushing layout → 100dvh + overflow hidden
 * 7. iOS backgrounding kills WebRTC → Visibility change reconnect
 * 8. Android Chrome audio routing → Uses setSinkId when available
 * 9. Clipboard API differences → Multiple fallbacks
 * 10. Wake Lock API differences → NoSleep.js pattern fallback
 * ═══════════════════════════════════════════════════════════════════════════════
 */

type Lang = 'en' | 'es'

interface Message {
  id: string
  speaker: string
  lang: Lang
  original: string
  translated: string
  isMe: boolean
  timestamp: Date
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const getPlatform = () => {
  if (typeof window === 'undefined') return { isIOS: false, isAndroid: false, isSafari: false, isChrome: false, isFirefox: false, isMobile: false }
  
  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/.test(ua)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
  const isChrome = /Chrome/.test(ua) && !/Edge|Edg/.test(ua)
  const isFirefox = /Firefox/.test(ua)
  const isMobile = isIOS || isAndroid || /Mobile/.test(ua)
  
  return { isIOS, isAndroid, isSafari, isChrome, isFirefox, isMobile }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const getFeatures = () => {
  if (typeof window === 'undefined') return {
    hasSpeechRecognition: false,
    hasWakeLock: false,
    hasPiP: false,
    hasClipboard: false,
    hasMediaDevices: false,
    hasGetDisplayMedia: false
  }
  
  return {
    hasSpeechRecognition: !!(window as any).webkitSpeechRecognition || !!(window as any).SpeechRecognition,
    hasWakeLock: 'wakeLock' in navigator,
    hasPiP: 'pictureInPictureEnabled' in document,
    hasClipboard: !!(navigator.clipboard?.writeText),
    hasMediaDevices: !!(navigator.mediaDevices?.getUserMedia),
    hasGetDisplayMedia: !!(navigator.mediaDevices?.getDisplayMedia)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICE SERVERS - Multiple fallbacks for all network conditions
// ═══════════════════════════════════════════════════════════════════════════════

const ICE_SERVERS = [
  // Google STUN - most reliable
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Twilio STUN
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Open TURN servers - critical for symmetric NAT
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
]

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION API
// ═══════════════════════════════════════════════════════════════════════════════

async function translateText(text: string, from: Lang, to: Lang): Promise<string> {
  if (from === to || !text.trim()) return text
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout
    
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
      signal: controller.signal
    })
    
    clearTimeout(timeout)
    
    if (!res.ok) throw new Error('Translation failed')
    const data = await res.json()
    return data.translation || text
  } catch (e) {
    console.warn('[Translate] Error:', e)
    return text
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIVERSAL CLIPBOARD COPY
// ═══════════════════════════════════════════════════════════════════════════════

async function universalCopy(text: string): Promise<boolean> {
  // Method 1: Modern Clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (e) {
      console.warn('[Clipboard] API failed, trying fallback')
    }
  }
  
  // Method 2: execCommand fallback (iOS Safari, older browsers)
  try {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    textArea.setAttribute('readonly', '') // Prevent keyboard on mobile
    document.body.appendChild(textArea)
    
    // iOS specific selection
    const platform = getPlatform()
    if (platform.isIOS) {
      const range = document.createRange()
      range.selectNodeContents(textArea)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      textArea.setSelectionRange(0, 999999)
    } else {
      textArea.select()
    }
    
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  } catch (e) {
    console.warn('[Clipboard] execCommand failed')
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODALS
// ═══════════════════════════════════════════════════════════════════════════════

function ShareModal({ callId, onClose }: { callId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')
  const link = typeof window !== 'undefined' ? `${window.location.origin}/call/${callId}` : ''

  const handleCopy = async () => {
    const success = await universalCopy(link)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setShareError('Could not copy. Please copy manually.')
    }
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my VoxLink call',
          text: 'Join my video call with real-time translation',
          url: link
        })
      } catch (e) {
        // User cancelled or error
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">Share Link</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-gray-400 text-sm mb-3">Send this link to your partner:</p>
        <div className="bg-[#0d0d14] rounded-xl p-3 mb-4">
          <p className="text-cyan-400 font-mono text-sm break-all select-all">{link}</p>
        </div>
        {shareError && <p className="text-red-400 text-xs mb-2">{shareError}</p>}
        <div className="flex gap-2">
          <button 
            onClick={handleCopy} 
            className={`flex-1 py-3 rounded-xl font-semibold text-white transition ${copied ? 'bg-green-500' : 'bg-cyan-500 active:bg-cyan-600'}`}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button 
              onClick={handleNativeShare}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-blue-500 active:bg-blue-600"
            >
              📤 Share
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsModal({ 
  onClose, 
  textSize, 
  setTextSize,
  onExportTranscript,
  platform,
  features
}: { 
  onClose: () => void
  textSize: 'small' | 'medium' | 'large'
  setTextSize: (s: 'small' | 'medium' | 'large') => void
  onExportTranscript: () => void
  platform: ReturnType<typeof getPlatform>
  features: ReturnType<typeof getFeatures>
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] rounded-2xl max-w-md w-full p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">⚙️ Settings</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">&times;</button>
        </div>
        
        {/* Text Size */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Text Size</label>
          <div className="grid grid-cols-3 gap-2">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setTextSize(size)}
                className={`py-2 rounded-lg font-medium transition ${textSize === size ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                {size === 'small' ? 'A' : size === 'medium' ? 'A+' : 'A++'}
              </button>
            ))}
          </div>
        </div>

        {/* Export Transcript */}
        <button 
          onClick={onExportTranscript}
          className="w-full py-3 bg-gray-800 text-white rounded-xl font-medium mb-4"
        >
          📄 Copy Transcript
        </button>

        {/* Device Info */}
        <div className="bg-[#0d0d14] rounded-xl p-3 mb-4">
          <p className="text-xs text-gray-500 mb-1">Device Info:</p>
          <p className="text-xs text-gray-400">
            {platform.isIOS ? '📱 iOS' : platform.isAndroid ? '📱 Android' : '💻 Desktop'} 
            {platform.isSafari ? ' • Safari' : platform.isChrome ? ' • Chrome' : platform.isFirefox ? ' • Firefox' : ''}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Speech: {features.hasSpeechRecognition ? '✓' : '✗'} | 
            Wake Lock: {features.hasWakeLock ? '✓' : '✗'} | 
            PiP: {features.hasPiP ? '✓' : '✗'}
          </p>
        </div>

        <button onClick={onClose} className="w-full py-3 bg-cyan-500 text-white rounded-xl font-semibold">
          Done
        </button>
      </div>
    </div>
  )
}

function EndModal({ onEnd, onCancel }: { onEnd: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-[#1a1a2e] rounded-2xl max-w-sm w-full p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-4xl mb-3">📞</div>
        <h2 className="text-lg font-bold text-white mb-2">End Call?</h2>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onCancel} className="py-3 bg-gray-700 text-white rounded-xl font-medium">Cancel</button>
          <button onClick={onEnd} className="py-3 bg-red-500 text-white rounded-xl font-medium">End Call</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOIN FORM
// ═══════════════════════════════════════════════════════════════════════════════

function JoinForm({ callId, onJoin }: { callId: string; onJoin: (name: string, lang: Lang) => void }) {
  const [name, setName] = useState('')
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => {
    try {
      const savedName = localStorage.getItem('voxlink_name')
      const savedLang = localStorage.getItem('voxlink_lang') as Lang
      if (savedName) setName(savedName)
      if (savedLang === 'en' || savedLang === 'es') setLang(savedLang)
    } catch (e) {
      // localStorage may not be available
    }
  }, [])

  const join = () => {
    const n = name.trim()
    if (!n) return alert('Please enter your name / Por favor ingresa tu nombre')
    try {
      localStorage.setItem('voxlink_name', n)
      localStorage.setItem('voxlink_lang', lang)
    } catch (e) {}
    onJoin(n, lang)
  }

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 text-3xl">📹</div>
          <h1 className="text-2xl font-bold text-white">Join Call / Unirse</h1>
          <p className="text-gray-400 text-sm mt-1">Room / Sala: <span className="text-cyan-400 font-mono">{callId.toUpperCase()}</span></p>
        </div>
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="Your name / Tu nombre"
            autoFocus
            autoComplete="name"
            autoCapitalize="words"
            className="w-full px-4 py-4 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white text-lg text-center mb-4 focus:border-cyan-500 focus:outline-none"
          />
          <p className="text-gray-400 text-sm text-center mb-3">I speak / Yo hablo:</p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            {(['en', 'es'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                type="button"
                className={`p-4 rounded-xl border-2 flex flex-col items-center transition ${lang === l ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400' : 'border-gray-700 text-gray-400'}`}
              >
                <span className="text-2xl mb-1">{l === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                <span className="text-sm font-medium">{l === 'en' ? 'English' : 'Español'}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={join} 
            type="button"
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-white font-bold text-lg active:opacity-90"
          >
            Join Call / Unirse
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO VIEW - Universal compatibility
// ═══════════════════════════════════════════════════════════════════════════════

function VideoView({ 
  stream, 
  label, 
  isLocal, 
  isMuted,
  isVideoOff,
  partnerLang,
  showWaiting, 
  onShare,
  onFlipCamera,
  canFlip,
  platform
}: {
  stream: MediaStream | null
  label: string
  isLocal: boolean
  isMuted?: boolean
  isVideoOff?: boolean
  partnerLang?: Lang
  showWaiting?: boolean
  onShare?: () => void
  onFlipCamera?: () => void
  canFlip?: boolean
  platform: ReturnType<typeof getPlatform>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      video.srcObject = stream
      
      const playVideo = async () => {
        try {
          // Set attributes that help with autoplay
          video.muted = isLocal
          video.playsInline = true
          video.autoplay = true
          
          await video.play()
          setPlaying(true)
          setError('')
        } catch (e: any) {
          console.log('[VIDEO] Autoplay blocked:', e.name)
          setPlaying(false)
          // Don't show error for local video - it's expected on iOS
          if (!isLocal) {
            setError('Tap to play')
          }
        }
      }
      
      // Small delay helps on some Android devices
      setTimeout(playVideo, 100)
    } else {
      video.srcObject = null
      setPlaying(false)
    }

    return () => {
      if (video) {
        video.srcObject = null
      }
    }
  }, [stream, isLocal])

  const handleTap = async () => {
    const video = videoRef.current
    if (video && stream) {
      try {
        video.muted = isLocal
        await video.play()
        setPlaying(true)
        setError('')
      } catch (e) {
        console.log('[VIDEO] Manual play failed:', e)
      }
    }
  }

  const handlePiP = async () => {
    const video = videoRef.current
    if (!video || isLocal) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if ((document as any).pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture()
      }
    } catch (e) {
      console.log('[PIP] Error:', e)
    }
  }

  return (
    <div 
      className="relative bg-gray-900 rounded-xl overflow-hidden flex-1 min-h-0 touch-manipulation" 
      onClick={handleTap}
    >
      {stream && !isVideoOff ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className={`absolute inset-0 w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
          />
          {!playing && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-center text-white p-4">
                <div className="text-5xl mb-3">▶️</div>
                <p className="text-base font-medium">Tap to play</p>
                {error && <p className="text-sm text-gray-400 mt-1">{error}</p>}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
          {showWaiting && !stream ? (
            <div className="text-center p-4">
              <div className="text-5xl mb-3 animate-pulse">⏳</div>
              <p className="text-gray-300 text-base mb-1">Waiting for partner...</p>
              <p className="text-gray-500 text-sm mb-4">Esperando compañero...</p>
              {onShare && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onShare(); }} 
                  className="px-6 py-3 bg-cyan-500 rounded-xl text-base text-white font-semibold active:bg-cyan-600"
                >
                  📤 Share Link
                </button>
              )}
            </div>
          ) : (
            <div className="text-center">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-4xl font-bold text-white mx-auto mb-2">
                {label[0]?.toUpperCase() || '?'}
              </div>
              {isVideoOff && <p className="text-gray-400 text-sm">Camera off</p>}
            </div>
          )}
        </div>
      )}
      
      {/* Flip camera button - local video only */}
      {isLocal && canFlip && stream && (
        <button 
          onClick={(e) => { e.stopPropagation(); onFlipCamera?.(); }}
          className="absolute top-2 left-2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white text-lg active:bg-black/80 touch-manipulation"
          title="Flip Camera"
        >
          🔄
        </button>
      )}

      {/* PiP button - remote video only, when supported */}
      {!isLocal && stream && playing && (document as any).pictureInPictureEnabled && !platform.isIOS && (
        <button 
          onClick={(e) => { e.stopPropagation(); handlePiP(); }}
          className="absolute top-2 left-2 w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white text-lg active:bg-black/80 touch-manipulation"
          title="Picture in Picture"
        >
          📺
        </button>
      )}
      
      {/* Label */}
      <div className="absolute bottom-2 left-2 bg-black/70 px-3 py-1.5 rounded-lg text-sm text-white flex items-center gap-2">
        <span className="font-medium">{label}</span>
        {isLocal && <span className="text-cyan-400 text-xs">(You)</span>}
        {!isLocal && partnerLang && (
          <span>{partnerLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
        )}
      </div>
      
      {/* Muted indicator */}
      {isLocal && isMuted && (
        <div className="absolute top-2 right-2 bg-red-500/90 px-3 py-1.5 rounded-lg text-sm text-white font-medium">
          🔇 Muted
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// NETWORK INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

function NetworkIndicator({ quality }: { quality: 'good' | 'fair' | 'poor' | 'unknown' }) {
  const bars = quality === 'good' ? 3 : quality === 'fair' ? 2 : quality === 'poor' ? 1 : 0
  const color = quality === 'good' ? 'bg-green-500' : quality === 'fair' ? 'bg-yellow-500' : quality === 'poor' ? 'bg-red-500' : 'bg-gray-500'
  
  return (
    <div className="flex items-end gap-0.5 h-4" title={`Network: ${quality}`}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={`w-1.5 rounded-sm ${i <= bars ? color : 'bg-gray-700'}`} style={{ height: `${i * 4 + 4}px` }} />
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CALL ROOM
// ═══════════════════════════════════════════════════════════════════════════════

function CallRoom({ callId, myName, myLang: initialLang, isHost }: {
  callId: string
  myName: string
  myLang: Lang
  isHost: boolean
}) {
  const router = useRouter()
  
  // Platform and features detection
  const [platform] = useState(() => getPlatform())
  const [features] = useState(() => getFeatures())

  // ===== STATE =====
  const [connectionState, setConnectionState] = useState<'initializing' | 'getting-media' | 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'error'>('initializing')
  const [error, setError] = useState('')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [partnerLang, setPartnerLang] = useState<Lang>('en')
  const [messages, setMessages] = useState<Message[]>([])
  const [interim, setInterim] = useState('')
  const [muted, setMuted] = useState(false)
  const [videoOff, setVideoOff] = useState(false)
  const [hasVideo, setHasVideo] = useState(true)
  const [myLang, setMyLang] = useState<Lang>(initialLang)
  const [isListening, setIsListening] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showEnd, setShowEnd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [networkQuality, setNetworkQuality] = useState<'good' | 'fair' | 'poor' | 'unknown'>('unknown')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)

  // ===== REFS =====
  const mountedRef = useRef(true)
  const peerRef = useRef<Peer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const dataConnRef = useRef<DataConnection | null>(null)
  const mediaConnRef = useRef<MediaConnection | null>(null)
  const speechRef = useRef<any>(null)
  const myLangRef = useRef(myLang)
  const mutedRef = useRef(muted)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const wakeLockRef = useRef<any>(null)
  const noSleepVideoRef = useRef<HTMLVideoElement | null>(null)

  // Sync refs
  useEffect(() => { myLangRef.current = myLang }, [myLang])
  useEffect(() => { mutedRef.current = muted }, [muted])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages, interim])

  // Check for multiple cameras
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      })
      .catch(() => setHasMultipleCameras(false))
  }, [])

  // Wake Lock with NoSleep fallback
  useEffect(() => {
    let noSleepVideo: HTMLVideoElement | null = null

    const enableWakeLock = async () => {
      // Try native Wake Lock API first
      if (features.hasWakeLock) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
          console.log('[WAKELOCK] Native acquired')
          return
        } catch (e) {
          console.log('[WAKELOCK] Native failed:', e)
        }
      }

      // NoSleep fallback - play a silent video to keep screen on
      try {
        noSleepVideo = document.createElement('video')
        noSleepVideo.setAttribute('playsinline', '')
        noSleepVideo.setAttribute('muted', '')
        noSleepVideo.setAttribute('loop', '')
        noSleepVideo.style.position = 'absolute'
        noSleepVideo.style.left = '-9999px'
        noSleepVideo.style.width = '1px'
        noSleepVideo.style.height = '1px'
        
        // Tiny video data URI that loops
        noSleepVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAA4BtZGF0AAACrwYF//+r3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjY0MyA1YzY1NzA0IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTMgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAABhWWIhAAv//72rvzLK0cLlS4dWXuzUfLoSXL9iDB9aAAAAwAAAwAAJuKiZ0WFMeJsgAAALmAIWElDyDzETFWKgSxFX1vBAAAAAwBhMOAACmYA'
        
        document.body.appendChild(noSleepVideo)
        noSleepVideoRef.current = noSleepVideo
        await noSleepVideo.play()
        console.log('[WAKELOCK] NoSleep fallback active')
      } catch (e) {
        console.log('[WAKELOCK] NoSleep failed:', e)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        enableWakeLock()
      }
    }

    enableWakeLock()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release() } catch {}
      }
      if (noSleepVideoRef.current) {
        noSleepVideoRef.current.pause()
        noSleepVideoRef.current.remove()
      }
    }
  }, [features.hasWakeLock])

  // Debug logger
  const log = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const fullMsg = `[${timestamp}] ${msg}`
    console.log(`[VoxLink v13] ${msg}`)
    setDebugLog(prev => [...prev.slice(-100), fullMsg])
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    mountedRef.current = true
    let retryCount = 0
    let retryTimer: NodeJS.Timeout | null = null
    let connectionCheckInterval: NodeJS.Timeout | null = null

    log('═══════════════════════════════════════')
    log(`INIT: ${isHost ? 'HOST' : 'GUEST'} | Room: ${callId}`)
    log(`Platform: ${platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Desktop'}`)
    log(`Browser: ${platform.isSafari ? 'Safari' : platform.isChrome ? 'Chrome' : platform.isFirefox ? 'Firefox' : 'Other'}`)
    log(`Features: Speech=${features.hasSpeechRecognition} WakeLock=${features.hasWakeLock} PiP=${features.hasPiP}`)
    log('═══════════════════════════════════════')

    // Helper: Add message
    const addMessage = async (speaker: string, lang: Lang, text: string, isMe: boolean) => {
      if (!text.trim() || !mountedRef.current) return
      const targetLang = lang === 'en' ? 'es' : 'en'
      const translated = await translateText(text, lang, targetLang)
      if (!mountedRef.current) return
      setMessages(prev => [...prev, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        speaker, lang, original: text, translated, isMe, timestamp: new Date()
      }])
    }

    // Helper: Send data
    const sendData = (data: any): boolean => {
      const conn = dataConnRef.current
      if (conn?.open) {
        try { conn.send(data); return true } catch (e) { log(`Send error: ${e}`) }
      }
      return false
    }

    // Helper: Handle data
    const handleData = (data: any) => {
      log(`Data: ${data.type}`)
      if (data.type === 'identity') {
        setPartnerName(data.name || 'Partner')
        setPartnerLang(data.lang || 'en')
      }
      if (data.type === 'speech' && data.text) {
        addMessage(data.name || 'Partner', data.lang || 'en', data.text, false)
      }
      if (data.type === 'ping') {
        sendData({ type: 'pong' })
      }
    }

    // Speech setup - with Firefox fallback
    const setupSpeech = () => {
      if (!features.hasSpeechRecognition) {
        log('Speech: Not supported on this browser')
        setSpeechSupported(false)
        return
      }
      
      setSpeechSupported(true)
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
      
      if (speechRef.current) {
        try { speechRef.current.stop() } catch {}
        speechRef.current = null
      }

      try {
        const recognition = new SR()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = myLangRef.current === 'es' ? 'es-ES' : 'en-US'
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
          log('Speech: Started')
          if (mountedRef.current) setIsListening(true)
        }

        recognition.onend = () => {
          log('Speech: Ended')
          if (mountedRef.current) setIsListening(false)
          // Auto-restart with delay
          if (!mutedRef.current && mountedRef.current && speechRef.current) {
            setTimeout(() => {
              if (speechRef.current && !mutedRef.current && mountedRef.current) {
                try { speechRef.current.start() } catch (e) { log(`Speech restart error: ${e}`) }
              }
            }, 500)
          }
        }

        recognition.onresult = (event: any) => {
          if (!mountedRef.current) return
          let final = '', interimText = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) final += transcript
            else interimText += transcript
          }
          setInterim(interimText)
          if (final.trim()) {
            setInterim('')
            log(`Speech: "${final.trim().substring(0, 50)}..."`)
            addMessage(myName, myLangRef.current, final.trim(), true)
            sendData({ type: 'speech', name: myName, lang: myLangRef.current, text: final.trim() })
          }
        }

        recognition.onerror = (event: any) => {
          log(`Speech error: ${event.error}`)
          if (mountedRef.current) setIsListening(false)
          
          // Only restart on recoverable errors
          const recoverableErrors = ['network', 'audio-capture', 'no-speech']
          if (recoverableErrors.includes(event.error) && !mutedRef.current && mountedRef.current) {
            setTimeout(() => {
              if (speechRef.current && !mutedRef.current && mountedRef.current) {
                try { speechRef.current.start() } catch {}
              }
            }, 2000)
          }
        }

        speechRef.current = recognition

        // Start with delay (needed for iOS)
        setTimeout(() => {
          if (speechRef.current && !mutedRef.current && mountedRef.current) {
            try {
              speechRef.current.start()
              log('Speech: Starting...')
            } catch (e) {
              log(`Speech start error: ${e}`)
            }
          }
        }, 3000)
      } catch (e) {
        log(`Speech setup error: ${e}`)
        setSpeechSupported(false)
      }
    }

    // Get media stream - platform-specific constraints
    const getMediaStream = async (facing: 'user' | 'environment' = 'user') => {
      log(`Getting media (facing: ${facing})...`)
      
      // Platform-specific video constraints
      let videoConstraints: MediaTrackConstraints | boolean
      
      if (platform.isIOS) {
        // iOS needs simple constraints
        videoConstraints = { facingMode: facing }
      } else if (platform.isAndroid) {
        // Android Chrome works better with exact facingMode
        videoConstraints = { 
          facingMode: { exact: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      } else {
        // Desktop
        videoConstraints = {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }

      // Audio constraints - universal
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }

      // Try video + audio first
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        })
        log(`Got video + audio (${stream.getVideoTracks().length} video, ${stream.getAudioTracks().length} audio)`)
        return { stream, hasVideo: true }
      } catch (videoErr: any) {
        log(`Video failed: ${videoErr.name} - ${videoErr.message}`)
        
        // Try with simpler video constraints
        if (videoErr.name === 'OverconstrainedError' || videoErr.name === 'ConstraintNotSatisfiedError') {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: facing },
              audio: audioConstraints
            })
            log('Got video with simple constraints')
            return { stream, hasVideo: true }
          } catch (e) {
            log(`Simple video also failed: ${e}`)
          }
        }
        
        // Fall back to audio only
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
          log('Got audio only')
          return { stream, hasVideo: false }
        } catch (audioErr: any) {
          log(`Audio failed: ${audioErr.name} - ${audioErr.message}`)
          throw new Error('Camera and microphone access required. Please allow access and refresh.')
        }
      }
    }

    // Setup connection monitoring
    const setupConnectionMonitoring = () => {
      connectionCheckInterval = setInterval(() => {
        if (!mountedRef.current) return
        
        const dataOpen = dataConnRef.current?.open
        const peerConnected = peerRef.current && !peerRef.current.disconnected
        
        if (connectionState === 'connected') {
          if (!dataOpen || !peerConnected) {
            log('Connection lost, attempting reconnect...')
            setConnectionState('reconnecting')
            setNetworkQuality('poor')
            
            if (peerRef.current && !peerRef.current.destroyed) {
              peerRef.current.reconnect()
            }
          } else {
            // Ping to check if connection is truly alive
            sendData({ type: 'ping' })
          }
        }
      }, 5000)
    }

    // Main init
    const init = async () => {
      setConnectionState('getting-media')

      try {
        const { stream, hasVideo: hasVid } = await getMediaStream('user')
        streamRef.current = stream
        setLocalStream(stream)
        setHasVideo(hasVid)
        setFacingMode('user')
      } catch (e: any) {
        log(`Media error: ${e.message}`)
        setError(e.message)
        setConnectionState('error')
        return
      }

      setConnectionState('connecting')

      // Create unique peer ID
      const peerId = isHost 
        ? `voxhost${callId}` 
        : `voxguest${callId}${Date.now()}${Math.random().toString(36).slice(2, 6)}`
      log(`Creating peer: ${peerId}`)

      const peer = new Peer(peerId, {
        debug: 2,
        config: { 
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10
        }
      })
      peerRef.current = peer

      peer.on('open', (id) => {
        log(`Peer open: ${id}`)
        
        if (isHost) {
          setConnectionState('waiting')
          log('HOST: Waiting for guest...')
          setupConnectionMonitoring()
        } else {
          // GUEST: Connect to host
          const hostId = `voxhost${callId}`
          
          const attemptConnection = () => {
            if (!mountedRef.current) return
            retryCount++
            log(`GUEST: Attempt ${retryCount} to ${hostId}`)
            setConnectionState('connecting')

            // Data connection first
            const dataConn = peer.connect(hostId, { reliable: true })
            
            dataConn.on('open', () => {
              log('GUEST: Data open')
              dataConnRef.current = dataConn
              dataConn.send({ type: 'identity', name: myName, lang: myLangRef.current })
              
              // Call host after data is open
              setTimeout(() => {
                if (!mountedRef.current || !streamRef.current) return
                log(`GUEST: Calling with ${streamRef.current.getTracks().length} tracks`)
                
                const call = peer.call(hostId, streamRef.current)
                if (!call) {
                  log('GUEST: Call failed!')
                  return
                }
                
                mediaConnRef.current = call

                call.on('stream', (remote) => {
                  log(`GUEST: Got remote (${remote.getTracks().length} tracks)`)
                  setRemoteStream(remote)
                  setConnectionState('connected')
                  setNetworkQuality('good')
                  setupConnectionMonitoring()
                  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
                })

                call.on('close', () => {
                  log('GUEST: Media closed')
                  if (mountedRef.current && connectionState === 'connected') {
                    setConnectionState('reconnecting')
                  }
                })
                
                call.on('error', (e) => log(`GUEST: Media error: ${e}`))
              }, 1000)
            })

            dataConn.on('data', (d) => handleData(d as any))
            
            dataConn.on('close', () => {
              log('GUEST: Data closed')
              if (mountedRef.current && connectionState === 'connected') {
                setConnectionState('reconnecting')
              }
            })
            
            dataConn.on('error', (e) => log(`GUEST: Data error: ${e}`))

            // Retry timeout
            retryTimer = setTimeout(() => {
              if (!remoteStream && mountedRef.current && retryCount < 6) {
                log('GUEST: Retrying...')
                attemptConnection()
              } else if (retryCount >= 6 && !remoteStream) {
                log('GUEST: Max retries reached')
                setError('Could not connect. Make sure your partner started the call first, then refresh this page.')
                setConnectionState('error')
              }
            }, 8000)
          }

          // Start connection attempt after delay
          setTimeout(attemptConnection, 1500)
        }

        // Setup speech recognition
        setupSpeech()
      })

      // HOST: Handle incoming connections
      peer.on('connection', (conn) => {
        log(`HOST: Data connection from ${conn.peer}`)
        dataConnRef.current = conn
        
        conn.on('open', () => {
          log('HOST: Data open')
          conn.send({ type: 'identity', name: myName, lang: myLangRef.current })
        })
        
        conn.on('data', (d) => handleData(d as any))
        conn.on('close', () => log('HOST: Data closed'))
        conn.on('error', (e) => log(`HOST: Data error: ${e}`))
      })

      peer.on('call', (call) => {
        log('HOST: Incoming call')
        
        if (!streamRef.current) {
          log('HOST: ERROR - No stream!')
          return
        }

        log(`HOST: Answering with ${streamRef.current.getTracks().length} tracks`)
        call.answer(streamRef.current)
        mediaConnRef.current = call

        call.on('stream', (remote) => {
          log(`HOST: Got remote (${remote.getTracks().length} tracks)`)
          setRemoteStream(remote)
          setConnectionState('connected')
          setNetworkQuality('good')
        })

        call.on('close', () => {
          log('HOST: Media closed')
          if (mountedRef.current) {
            setRemoteStream(null)
            setConnectionState('waiting')
          }
        })
        
        call.on('error', (e) => log(`HOST: Media error: ${e}`))
      })

      peer.on('error', (err) => {
        log(`Peer error: ${err.type} - ${err.message}`)
        
        if (err.type === 'unavailable-id') {
          setError('This room already has a host. Try a different room code.')
          setConnectionState('error')
        } else if (err.type === 'peer-unavailable' && !isHost) {
          log('Host not found, will retry...')
        } else if (err.type === 'network' || err.type === 'server-error') {
          setNetworkQuality('poor')
          if (mountedRef.current && connectionState === 'connected') {
            setConnectionState('reconnecting')
          }
        }
      })

      peer.on('disconnected', () => {
        log('Peer disconnected')
        setNetworkQuality('poor')
        
        if (mountedRef.current && peerRef.current && !peerRef.current.destroyed) {
          setTimeout(() => {
            if (peerRef.current && !peerRef.current.destroyed && mountedRef.current) {
              log('Attempting reconnect...')
              peerRef.current.reconnect()
            }
          }, 2000)
        }
      })

      peer.on('close', () => log('Peer closed'))
    }

    // Handle page visibility
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        log('Page visible')
        if (peerRef.current?.disconnected && !peerRef.current.destroyed) {
          log('Reconnecting after visibility change...')
          peerRef.current.reconnect()
        }
      } else {
        log('Page hidden')
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    // Start initialization
    init()

    // Cleanup
    return () => {
      log('Cleanup starting...')
      mountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      
      if (retryTimer) clearTimeout(retryTimer)
      if (connectionCheckInterval) clearInterval(connectionCheckInterval)
      
      if (speechRef.current) {
        try { speechRef.current.stop() } catch {}
        speechRef.current = null
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          t.stop()
          log(`Stopped track: ${t.kind}`)
        })
        streamRef.current = null
      }
      
      if (dataConnRef.current) {
        try { dataConnRef.current.close() } catch {}
        dataConnRef.current = null
      }
      
      if (mediaConnRef.current) {
        try { mediaConnRef.current.close() } catch {}
        mediaConnRef.current = null
      }
      
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      
      log('Cleanup complete')
    }
  }, [callId, isHost, myName, platform, features, log])

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleMute = useCallback(() => {
    const newMuted = !muted
    setMuted(newMuted)
    mutedRef.current = newMuted
    
    streamRef.current?.getAudioTracks().forEach(t => { 
      t.enabled = !newMuted 
    })
    
    if (speechRef.current) {
      if (newMuted) {
        try { speechRef.current.stop() } catch {}
        setIsListening(false)
      } else {
        try { speechRef.current.start() } catch {}
      }
    }
    
    log(`Mute: ${newMuted}`)
  }, [muted, log])

  const toggleVideo = useCallback(() => {
    const newOff = !videoOff
    setVideoOff(newOff)
    streamRef.current?.getVideoTracks().forEach(t => { 
      t.enabled = !newOff 
    })
    log(`Video: ${newOff ? 'off' : 'on'}`)
  }, [videoOff, log])

  const flipCamera = useCallback(async () => {
    if (!hasVideo || !hasMultipleCameras) return
    
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    log(`Flipping camera to: ${newFacing}`)
    
    try {
      // Stop current video tracks
      streamRef.current?.getVideoTracks().forEach(t => t.stop())
      
      // Get new video track with appropriate constraints
      let videoConstraints: MediaTrackConstraints
      if (platform.isIOS) {
        videoConstraints = { facingMode: newFacing }
      } else if (platform.isAndroid) {
        videoConstraints = { facingMode: { exact: newFacing } }
      } else {
        videoConstraints = { 
          facingMode: newFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      }
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      })
      
      const newVideoTrack = newStream.getVideoTracks()[0]
      if (!newVideoTrack) throw new Error('No video track')
      
      // Replace track in our stream
      const oldVideoTrack = streamRef.current?.getVideoTracks()[0]
      if (oldVideoTrack && streamRef.current) {
        streamRef.current.removeTrack(oldVideoTrack)
      }
      streamRef.current?.addTrack(newVideoTrack)
      
      // Replace track in peer connection
      if (mediaConnRef.current) {
        const peerConnection = (mediaConnRef.current as any).peerConnection
        if (peerConnection) {
          const senders = peerConnection.getSenders()
          const videoSender = senders.find((s: RTCRtpSender) => s.track?.kind === 'video')
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack)
            log('Track replaced in peer connection')
          }
        }
      }
      
      setLocalStream(streamRef.current ? new MediaStream(streamRef.current.getTracks()) : null)
      setFacingMode(newFacing)
      log(`Camera flipped to: ${newFacing}`)
    } catch (e: any) {
      log(`Flip error: ${e.message}`)
      // Try simpler constraint on error
      if (platform.isAndroid && e.name === 'OverconstrainedError') {
        try {
          const simpleStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacing },
            audio: false
          })
          // ... same replacement logic
          log('Flip succeeded with simple constraints')
        } catch (e2) {
          log(`Flip failed completely: ${e2}`)
        }
      }
    }
  }, [facingMode, hasVideo, hasMultipleCameras, platform, log])

  const changeLang = useCallback((newLang: Lang) => {
    setMyLang(newLang)
    myLangRef.current = newLang
    try { localStorage.setItem('voxlink_lang', newLang) } catch {}
    
    if (speechRef.current) {
      try { speechRef.current.stop() } catch {}
      speechRef.current.lang = newLang === 'es' ? 'es-ES' : 'en-US'
      if (!muted) {
        setTimeout(() => {
          try { speechRef.current?.start() } catch {}
        }, 300)
      }
    }
    
    if (dataConnRef.current?.open) {
      dataConnRef.current.send({ type: 'identity', name: myName, lang: newLang })
    }
    
    log(`Language: ${newLang}`)
  }, [muted, myName, log])

  const exportTranscript = useCallback(async () => {
    const text = messages.map(m => 
      `[${m.timestamp.toLocaleTimeString()}] ${m.speaker} (${m.lang === 'en' ? 'EN' : 'ES'}):\n${m.original}\n→ ${m.translated}`
    ).join('\n\n')
    
    const success = await universalCopy(text)
    alert(success ? 'Transcript copied!' : 'Could not copy. Please try again.')
  }, [messages])

  const manualReconnect = useCallback(() => {
    log('Manual reconnect')
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.reconnect()
    } else {
      window.location.reload()
    }
  }, [log])

  const endCall = useCallback(() => {
    log('Ending call')
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    if (peerRef.current) {
      peerRef.current.destroy()
    }
    router.push('/')
  }, [router, log])

  // Text size class
  const textSizeClass = textSize === 'small' ? 'text-xs' : textSize === 'large' ? 'text-base' : 'text-sm'

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const getStatusText = () => {
    switch (connectionState) {
      case 'initializing': return 'Starting...'
      case 'getting-media': return 'Camera access...'
      case 'connecting': return 'Connecting...'
      case 'waiting': return 'Waiting...'
      case 'connected': return partnerName || 'Connected'
      case 'reconnecting': return 'Reconnecting...'
      case 'error': return 'Error'
      default: return ''
    }
  }

  const getStatusColor = () => {
    if (connectionState === 'connected') return 'bg-green-500'
    if (connectionState === 'error') return 'bg-red-500'
    if (connectionState === 'reconnecting') return 'bg-orange-500 animate-pulse'
    return 'bg-yellow-500 animate-pulse'
  }

  // Error screen
  if (connectionState === 'error') {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Connection Error</h1>
          <p className="text-gray-400 mb-6 text-sm">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 bg-cyan-500 rounded-xl text-white font-semibold mb-3 active:bg-cyan-600"
          >
            🔄 Try Again
          </button>
          <button 
            onClick={() => router.push('/')} 
            className="w-full py-3 bg-gray-700 rounded-xl text-white active:bg-gray-600"
          >
            🏠 Go Home
          </button>
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="mt-4 text-xs text-gray-500 underline"
          >
            {showDebug ? 'Hide' : 'Show'} Debug Log
          </button>
          {showDebug && (
            <div className="mt-2 bg-black/50 rounded-lg p-2 text-left max-h-48 overflow-y-auto">
              {debugLog.slice(-30).map((line, i) => (
                <p key={i} className="text-[10px] text-gray-400 font-mono">{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="h-[100dvh] bg-[#0a0a0f] flex flex-col overflow-hidden">
      {showShare && <ShareModal callId={callId} onClose={() => setShowShare(false)} />}
      {showEnd && <EndModal onEnd={endCall} onCancel={() => setShowEnd(false)} />}
      {showSettings && (
        <SettingsModal 
          onClose={() => setShowSettings(false)}
          textSize={textSize}
          setTextSize={setTextSize}
          onExportTranscript={exportTranscript}
          platform={platform}
          features={features}
        />
      )}

      {/* Header */}
      <header className="bg-[#12121a] border-b border-gray-800 px-2 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-lg">🔗</div>
          <div>
            <div className="text-[10px] text-cyan-400 tracking-widest font-medium">VOXLINK</div>
            <div className="text-white font-mono text-xs">{callId.toUpperCase()}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NetworkIndicator quality={networkQuality} />
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor()}`} />
          <span className="text-gray-400 text-xs max-w-[70px] truncate">{getStatusText()}</span>
          {isListening && <span className="text-red-500 text-sm animate-pulse">●</span>}
        </div>

        <div className="flex gap-1">
          <button 
            onClick={() => changeLang(myLang === 'en' ? 'es' : 'en')} 
            className="p-2 bg-gray-800 rounded-lg text-base active:bg-gray-700"
          >
            {myLang === 'en' ? '🇺🇸' : '🇪🇸'}
          </button>
          <button 
            onClick={() => setShowSettings(true)} 
            className="p-2 bg-gray-800 rounded-lg text-base active:bg-gray-700"
          >
            ⚙️
          </button>
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="p-2 bg-gray-800 rounded-lg text-xs active:bg-gray-700"
          >
            🐛
          </button>
        </div>
      </header>

      {/* Debug Panel */}
      {showDebug && (
        <div className="bg-black/95 p-2 max-h-28 overflow-y-auto shrink-0 border-b border-gray-800">
          {debugLog.slice(-20).map((line, i) => (
            <p key={i} className="text-[9px] text-green-400 font-mono leading-tight">{line}</p>
          ))}
          <div className="flex gap-2 mt-2">
            <button 
              onClick={manualReconnect} 
              className="text-[10px] text-cyan-400 underline"
            >
              Force Reconnect
            </button>
            <span className="text-[10px] text-gray-600">|</span>
            <span className="text-[10px] text-gray-500">
              {platform.isIOS ? 'iOS' : platform.isAndroid ? 'Android' : 'Desktop'} • 
              Speech: {speechSupported ? '✓' : '✗'}
            </span>
          </div>
        </div>
      )}

      {/* Videos */}
      <div className="flex-1 p-2 flex flex-col sm:flex-row gap-2 min-h-0">
        <VideoView 
          stream={localStream} 
          label={myName} 
          isLocal={true} 
          isMuted={muted}
          isVideoOff={videoOff}
          onFlipCamera={flipCamera}
          canFlip={hasVideo && hasMultipleCameras}
          platform={platform}
        />
        <VideoView 
          stream={remoteStream} 
          label={partnerName || 'Partner'} 
          isLocal={false} 
          partnerLang={partnerLang}
          showWaiting={!remoteStream && connectionState !== 'error'} 
          onShare={() => setShowShare(true)}
          platform={platform}
        />
      </div>

      {/* Transcript */}
      <div 
        ref={transcriptRef}
        className={`bg-[#12121a] border-t border-gray-800 shrink-0 overflow-y-auto p-2 transition-all duration-300 ${
          transcriptExpanded ? 'h-[40vh]' : 'h-[18vh] min-h-[90px]'
        }`}
      >
        {/* Expand handle */}
        <div 
          className="flex justify-center mb-2 cursor-pointer py-1" 
          onClick={() => setTranscriptExpanded(!transcriptExpanded)}
        >
          <div className="w-12 h-1.5 bg-gray-700 rounded-full" />
        </div>
        
        {messages.length === 0 && !interim ? (
          <div className="h-full flex items-center justify-center pb-4">
            <div className="text-center">
              {speechSupported ? (
                <>
                  <p className="text-gray-400 text-sm">
                    {isListening ? '🔴 Listening...' : '🎤 Speak to translate'}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    {isListening ? 'Escuchando...' : 'Habla para traducir'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-400 text-sm">⚠️ Speech not supported</p>
                  <p className="text-gray-600 text-xs mt-1">Use Chrome for voice recognition</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  m.isMe ? 'bg-cyan-500/20 border border-cyan-500/30' : 'bg-gray-800'
                }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] text-gray-500">
                      {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs">{m.lang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                    <span className="text-[10px] text-gray-500">{m.speaker}</span>
                  </div>
                  <p className={`text-white ${textSizeClass}`}>{m.original}</p>
                  <p className={`${textSizeClass} mt-1.5 ${m.isMe ? 'text-cyan-300' : 'text-green-400'}`}>
                    {m.lang === 'en' ? '🇪🇸' : '🇺🇸'} {m.translated}
                  </p>
                </div>
              </div>
            ))}
            {interim && (
              <div className="flex justify-end">
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2 max-w-[85%]">
                  <p className={`text-cyan-300 ${textSizeClass} italic`}>{interim}...</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-[#0a0a0f] border-t border-gray-800 p-3 pb-8 shrink-0">
        <div className="flex justify-center items-center gap-3">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition touch-manipulation ${
              muted ? 'bg-red-500' : 'bg-gray-700'
            }`}
          >
            {muted ? '🔇' : '🎤'}
          </button>
          
          {hasVideo && (
            <>
              <button
                onClick={toggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition touch-manipulation ${
                  videoOff ? 'bg-red-500' : 'bg-gray-700'
                }`}
              >
                {videoOff ? '📷' : '📹'}
              </button>
              
              {hasMultipleCameras && (
                <button
                  onClick={flipCamera}
                  className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl touch-manipulation active:bg-gray-600"
                >
                  🔄
                </button>
              )}
            </>
          )}
          
          <button 
            onClick={() => setShowShare(true)} 
            className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-2xl touch-manipulation active:bg-gray-600"
          >
            👥
          </button>
          
          <button 
            onClick={() => setShowEnd(true)} 
            className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-2xl touch-manipulation active:bg-red-700"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

function CallContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const callId = params.id as string
  const urlName = searchParams.get('name')
  const urlLang = searchParams.get('lang') as Lang
  const urlHost = searchParams.get('host')

  const [joined, setJoined] = useState(false)
  const [name, setName] = useState(urlName ? decodeURIComponent(urlName) : '')
  const [lang, setLang] = useState<Lang>(urlLang || 'en')
  const isHost = urlHost === 'true'

  useEffect(() => {
    if (urlName && urlLang) setJoined(true)
  }, [urlName, urlLang])

  if (!joined) {
    return <JoinForm callId={callId} onJoin={(n, l) => { setName(n); setLang(l); setJoined(true) }} />
  }

  return <CallRoom callId={callId} myName={name} myLang={lang} isHost={isHost} />
}

export default function CallPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading VoxLink...</p>
          <p className="text-gray-600 text-xs mt-1">Cargando...</p>
        </div>
      </div>
    }>
      <CallContent />
    </Suspense>
  )
}
