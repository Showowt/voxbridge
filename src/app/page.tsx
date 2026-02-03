'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Check for auto-join params from shared link
  const joinType = searchParams.get('join') // 'call' or 'talk'
  const joinId = searchParams.get('id')
  
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [joinCode, setJoinCode] = useState('')
  const [activeTab, setActiveTab] = useState<'video' | 'talk'>('video')
  const [mode, setMode] = useState<'start' | 'join'>('start')
  const [isJoining, setIsJoining] = useState(false)

  useEffect(() => {
    const savedName = localStorage.getItem('voxbridge_name')
    const savedLang = localStorage.getItem('voxbridge_lang') as 'en' | 'es'
    if (savedName) setName(savedName)
    if (savedLang) setLanguage(savedLang)
    
    // If coming from a shared link, set up auto-join
    if (joinType && joinId) {
      setIsJoining(true)
      setJoinCode(joinId.toUpperCase())
      setActiveTab(joinType === 'talk' ? 'talk' : 'video')
      setMode('join')
    }
  }, [joinType, joinId])

  const save = () => {
    localStorage.setItem('voxbridge_name', name)
    localStorage.setItem('voxbridge_lang', language)
  }

  const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const startVideoCall = () => {
    if (!name.trim()) return alert('Enter your name')
    save()
    const id = generateId()
    sessionStorage.setItem(`vox_${id}_role`, 'host')
    router.push(`/call/${id}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  const joinVideoCall = () => {
    if (!name.trim()) return alert('Enter your name / Ingresa tu nombre')
    if (!joinCode.trim()) return alert('Enter the call code')
    save()
    const code = joinCode.trim().toUpperCase()
    sessionStorage.setItem(`vox_${code}_role`, 'guest')
    router.push(`/call/${code}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  const startTalkMode = () => {
    if (!name.trim()) return alert('Enter your name')
    save()
    const id = generateId()
    sessionStorage.setItem(`vox_${id}_role`, 'host')
    router.push(`/talk/${id}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  const joinTalkMode = () => {
    if (!name.trim()) return alert('Enter your name / Ingresa tu nombre')
    if (!joinCode.trim()) return alert('Enter the code')
    save()
    const code = joinCode.trim().toUpperCase()
    sessionStorage.setItem(`vox_${code}_role`, 'guest')
    router.push(`/talk/${code}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Auto-join screen when coming from shared link
  if (isJoining && joinId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-3">
              <span className="text-3xl">🌐</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Join Conversation</h1>
            <p className="text-gray-400 text-sm">
              {joinType === 'talk' ? 'Face-to-Face Translation' : 'Video Call with Translation'}
            </p>
          </div>

          {/* Join Card */}
          <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
            {/* Code Display */}
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500 mb-2">Joining Room / Unirse a la sala</p>
              <p className="text-3xl font-mono font-bold text-cyan-400 tracking-widest">{joinId.toUpperCase()}</p>
            </div>

            {/* Name Input - Bilingual */}
            <div className="mb-5">
              <label className="block text-sm text-gray-400 mb-2">
                Your Name / Tu Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name / Ingresa tu nombre"
                autoFocus
                className="w-full px-4 py-4 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition text-lg text-center"
              />
            </div>

            {/* Language Selection - Clear bilingual */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2 text-center">
                I speak / Yo hablo
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLanguage('en')}
                  className={`p-4 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 ${
                    language === 'en'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                      : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                  }`}
                >
                  <span className="text-3xl">🇺🇸</span>
                  <span className="font-medium">English</span>
                </button>
                <button
                  onClick={() => setLanguage('es')}
                  className={`p-4 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 ${
                    language === 'es'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                      : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                  }`}
                >
                  <span className="text-3xl">🇪🇸</span>
                  <span className="font-medium">Español</span>
                </button>
              </div>
            </div>

            {/* Join Button */}
            <button
              onClick={joinType === 'talk' ? joinTalkMode : joinVideoCall}
              className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-green-600 hover:to-emerald-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
            >
              {joinType === 'talk' ? '💬 Join / Unirse' : '📹 Join / Unirse'}
            </button>
          </div>

          <p className="text-center text-gray-500 text-xs mt-4">
            Works on any device • Funciona en cualquier dispositivo
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-3">
            <span className="text-3xl">🔗</span>
          </div>
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-sm font-medium text-cyan-400">MACHINEMIND</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">VoxLink™</h1>
          <p className="text-gray-400 text-sm">Break Language Barriers Instantly</p>
        </div>

        {/* Card */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 overflow-hidden">
          {/* Mode Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('video')}
              className={`flex-1 py-4 text-center font-medium transition ${
                activeTab === 'video'
                  ? 'text-cyan-400 border-b-2 border-green-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📹 Video Call
            </button>
            <button
              onClick={() => setActiveTab('talk')}
              className={`flex-1 py-4 text-center font-medium transition ${
                activeTab === 'talk'
                  ? 'text-cyan-400 border-b-2 border-green-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💬 Face-to-Face
            </button>
          </div>

          <div className="p-5">
            {/* Description */}
            <div className="mb-5 p-3 rounded-xl bg-gray-800/50 text-center">
              {activeTab === 'video' ? (
                <p className="text-gray-300 text-sm">
                  <span className="text-cyan-400 font-medium">Video Call:</span> Remote calls with live translation
                </p>
              ) : (
                <p className="text-gray-300 text-sm">
                  <span className="text-cyan-400 font-medium">Face-to-Face:</span> Sit with someone, each person uses their phone. Speak and see instant translations!
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
                  mode === 'start' ? 'bg-green-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                }`}
              >
                Start New
              </button>
              <button
                onClick={() => setMode('join')}
                className={`flex-1 py-2 rounded-lg font-medium transition ${
                  mode === 'join' ? 'bg-green-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                }`}
              >
                Join
              </button>
            </div>

            {/* Action */}
            {mode === 'start' ? (
              <button
                onClick={activeTab === 'video' ? startVideoCall : startTalkMode}
                className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-green-600 hover:to-emerald-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
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
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
