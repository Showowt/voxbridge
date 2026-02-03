'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Instagram, ArrowRight, Mail, Zap, Calendar, Clock, Gift, 
  Users, Trophy, Share2, Copy, Check, ChevronDown, ChevronUp,
  Sparkles, Target, Rocket, Crown, Star, ExternalLink
} from 'lucide-react'

// Challenge data
const challenges = [
  {
    day: 'Monday',
    date: 'Feb 3',
    name: 'Money Monday',
    tool: 'AI Revenue Leak Detector',
    audience: 'Entrepreneurs & Business Owners',
    emoji: '💰',
    color: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    description: 'Discover where your business is bleeding money. This AI analyzes your operations and finds the revenue leaks you didn\'t know existed.',
    features: ['Identifies hidden costs', 'Spots pricing inefficiencies', 'Finds automation opportunities', 'Generates action plan'],
    value: '$2,000+',
  },
  {
    day: 'Tuesday',
    date: 'Feb 4',
    name: 'Tool Tuesday',
    tool: 'AI Content Calendar Generator',
    audience: 'Creators & Side Hustlers',
    emoji: '🛠️',
    color: 'from-blue-500 to-cyan-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    description: '30 days of content planned in 30 seconds. Never stare at a blank screen again.',
    features: ['30 days of posts', 'Platform-specific formats', 'Hashtag recommendations', 'Best posting times'],
    value: '$500+',
  },
  {
    day: 'Wednesday',
    date: 'Feb 5',
    name: 'Wellness Wednesday',
    tool: 'AI Self-Care Concierge',
    audience: 'Queens Who Prioritize Themselves',
    emoji: '💅',
    color: 'from-pink-500 to-rose-600',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    description: 'Your personal AI wellness advisor. Get customized self-care routines, product recommendations, and daily rituals.',
    features: ['Personalized routines', 'Product recommendations', 'Daily affirmations', 'Wellness tracking'],
    value: '$300+',
  },
  {
    day: 'Thursday',
    date: 'Feb 6',
    name: 'Thirsty Thursday',
    tool: 'AI Party & Vibe Planner',
    audience: 'Social Butterflies & Event Planners',
    emoji: '🔥',
    color: 'from-purple-500 to-violet-600',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    description: 'Plan the perfect event in minutes. From intimate dinners to massive parties.',
    features: ['Venue suggestions', 'Theme ideas', 'Playlist curation', 'Budget planning'],
    value: '$400+',
  },
  {
    day: 'Friday',
    date: 'Feb 7',
    name: 'Flex Friday',
    tool: 'AI Luxury Concierge',
    audience: 'High Earners & Luxury Lovers',
    emoji: '💎',
    color: 'from-amber-500 to-yellow-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    description: 'Experience luxury without the premium price research. AI-powered recommendations for the finer things.',
    features: ['Restaurant picks', 'Travel recommendations', 'Experience curation', 'VIP access tips'],
    value: '$1,000+',
  },
  {
    day: 'Saturday',
    date: 'Feb 8',
    name: 'Side Hustle Saturday',
    tool: 'AI Business Idea Validator',
    audience: 'Future Entrepreneurs',
    emoji: '🎯',
    color: 'from-red-500 to-orange-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    description: 'Is your business idea actually good? Get honest AI analysis before you invest time and money.',
    features: ['Market analysis', 'Competition check', 'Revenue potential', 'Launch roadmap'],
    value: '$800+',
  },
  {
    day: 'Sunday',
    date: 'Feb 9',
    name: 'Main Character Sunday',
    tool: 'AI Personal Brand Builder',
    audience: 'EVERYONE',
    emoji: '👑',
    color: 'from-yellow-400 to-amber-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    description: 'Become the main character of your industry. Complete brand strategy in minutes.',
    features: ['Brand voice guide', 'Bio generator', 'Content pillars', 'Visual direction'],
    value: '$1,500+',
  },
]

// Countdown component
function Countdown({ targetDate }: { targetDate: Date }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime()
      const distance = targetDate.getTime() - now
      
      if (distance < 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }
      
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [targetDate])
  
  return (
    <div className="flex gap-2 text-sm">
      <div className="countdown-box px-2 py-1 rounded">
        <span className="font-bold">{timeLeft.days}</span>
        <span className="text-white/50 ml-1">d</span>
      </div>
      <div className="countdown-box px-2 py-1 rounded">
        <span className="font-bold">{timeLeft.hours}</span>
        <span className="text-white/50 ml-1">h</span>
      </div>
      <div className="countdown-box px-2 py-1 rounded">
        <span className="font-bold">{timeLeft.minutes}</span>
        <span className="text-white/50 ml-1">m</span>
      </div>
      <div className="countdown-box px-2 py-1 rounded">
        <span className="font-bold">{timeLeft.seconds}</span>
        <span className="text-white/50 ml-1">s</span>
      </div>
    </div>
  )
}

// Animated counter
function AnimatedCounter({ target, duration = 2000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  
  useEffect(() => {
    const startTime = Date.now()
    const startValue = countRef.current
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.floor(startValue + (target - startValue) * easeOut)
      
      setCount(current)
      countRef.current = current
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    
    requestAnimationFrame(animate)
  }, [target, duration])
  
  return <span className="counter-value">{count.toLocaleString()}</span>
}

export default function Home() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [subscriberCount, setSubscriberCount] = useState(523) // Starting number for social proof
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [showPitchForm, setShowPitchForm] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  
  const scheduleRef = useRef<HTMLDivElement>(null)
  const notifyRef = useRef<HTMLDivElement>(null)
  const pitchRef = useRef<HTMLDivElement>(null)

  // Challenge start date (Feb 3, 2026)
  const challengeStart = new Date('2026-02-03T00:00:00')
  
  // Check for referral code in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      localStorage.setItem('referredBy', ref)
    }
  }, [])
  
  // Fetch real subscriber count
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats')
        const data = await res.json()
        if (data.count) {
          setSubscriberCount(data.count)
        }
      } catch (err) {
        console.error('Failed to fetch stats')
      }
    }
    fetchStats()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email')
      setIsSubmitting(false)
      return
    }
    
    try {
      // Get referral code from localStorage if exists
      const referredBy = typeof window !== 'undefined' ? localStorage.getItem('referredBy') : null
      
      // Save to Supabase
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          referredBy,
          source: 'landing_page'
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe')
      }
      
      setReferralCode(data.referralCode || '')
      setIsSubmitted(true)
      setSubscriberCount(prev => prev + 1)
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('already')) {
        setError('You\'re already signed up! Check your email.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${referralCode ? `?ref=${referralCode}` : ''}`
    : ''

  const shareText = "🚀 7 Days. 7 Free AI Tools. Every tool is worth $500-2000. I just signed up - find your day:"

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {/* Floating elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-brand-pink/20 rounded-full blur-[100px] animate-float" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-brand-purple/20 rounded-full blur-[120px] animate-float" style={{ animationDelay: '-3s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-orange/10 rounded-full blur-[150px]" />
        </div>
        
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8 animate-fade-in">
            <Gift className="w-4 h-4 text-brand-pink" />
            <span className="text-sm text-white/80">100% Free • No Catch • Real Value</span>
          </div>
          
          {/* Main headline */}
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black mb-6 leading-tight animate-slide-up">
            <span className="text-white">7 DAYS.</span>
            <br />
            <span className="gradient-text">7 FREE AI TOOLS.</span>
          </h1>
          
          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-white/70 mb-4 max-w-2xl mx-auto animate-slide-up stagger-1">
            Every day this week, I'm building something <strong className="text-white">completely free</strong> for a different audience.
          </p>
          <p className="text-lg md:text-xl text-brand-pink mb-8 animate-slide-up stagger-2">
            Find your day. Get your tool.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-slide-up stagger-3">
            <button 
              onClick={() => scrollToSection(scheduleRef)}
              className="btn-primary px-8 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2"
            >
              See The Schedule <ArrowRight className="w-5 h-5" />
            </button>
            <button 
              onClick={() => scrollToSection(notifyRef)}
              className="px-8 py-4 rounded-xl font-semibold text-lg glass-card glass-card-hover flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" /> Get Notified
            </button>
          </div>
          
          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 animate-slide-up stagger-4">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-black text-white">7</div>
              <div className="text-white/50 text-sm">Free Tools</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-black text-white">$0</div>
              <div className="text-white/50 text-sm">Cost to You</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-black gradient-text">$6K+</div>
              <div className="text-white/50 text-sm">Total Value</div>
            </div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-8 h-8 text-white/30" />
        </div>
      </section>

      {/* Live Counter Bar */}
      <div className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10 py-3">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-white/70">
              <AnimatedCounter target={subscriberCount} /> people signed up
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/50">Challenge starts in:</span>
            <Countdown targetDate={challengeStart} />
          </div>
        </div>
      </div>

      {/* Schedule Section */}
      <section ref={scheduleRef} id="schedule" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black mb-4">
              <span className="text-white">THE </span>
              <span className="gradient-text-pink">LINEUP</span>
            </h2>
            <p className="text-white/60 text-lg">Something for everyone. Find your day.</p>
          </div>
          
          <div className="space-y-4">
            {challenges.map((challenge, index) => (
              <div 
                key={index}
                className={`glass-card rounded-2xl overflow-hidden transition-all duration-300 ${
                  expandedDay === index ? 'ring-2 ring-white/20' : ''
                }`}
              >
                <button
                  onClick={() => setExpandedDay(expandedDay === index ? null : index)}
                  className="w-full p-6 flex items-center gap-4 text-left hover:bg-white/5 transition-colors"
                >
                  {/* Emoji icon */}
                  <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${challenge.color} flex items-center justify-center text-3xl shrink-0`}>
                    {challenge.emoji}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-white/50 mb-1">
                      <span>{challenge.day}</span>
                      <span>•</span>
                      <span>{challenge.date}</span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">{challenge.name}</h3>
                    <p className="text-brand-pink text-sm">{challenge.tool}</p>
                  </div>
                  
                  {/* Audience tag */}
                  <div className="hidden md:block">
                    <span className="px-3 py-1 rounded-full text-xs bg-white/10 text-white/70">
                      For: {challenge.audience}
                    </span>
                  </div>
                  
                  {/* Expand icon */}
                  <div className="shrink-0">
                    {expandedDay === index ? (
                      <ChevronUp className="w-5 h-5 text-white/50" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-white/50" />
                    )}
                  </div>
                </button>
                
                {/* Expanded content */}
                {expandedDay === index && (
                  <div className="px-6 pb-6 border-t border-white/10 pt-4">
                    <p className="text-white/70 mb-4">{challenge.description}</p>
                    
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white mb-2">What you get:</h4>
                        <ul className="space-y-1">
                          {challenge.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-white/60">
                              <Check className="w-4 h-4 text-green-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col justify-center items-center md:items-end">
                        <div className="text-sm text-white/50 mb-1">Value:</div>
                        <div className="text-3xl font-black gradient-text">{challenge.value}</div>
                        <div className="text-sm text-white/50">Yours FREE</div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => scrollToSection(notifyRef)}
                      className="w-full btn-primary py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
                    >
                      Get Notified for This Drop <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 FREE WEBSITES GIVEAWAY */}
      <section ref={pitchRef} className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-purple/10 to-transparent pointer-events-none" />
        
        <div className="max-w-4xl mx-auto relative">
          <div className="glass-card rounded-3xl p-8 md:p-12 border border-brand-purple/30">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-purple to-brand-pink flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="text-xs text-brand-purple font-semibold uppercase tracking-wider">Limited Opportunity</span>
                <h2 className="text-2xl md:text-3xl font-black text-white">5 FREE Custom Websites</h2>
              </div>
            </div>
            
            <p className="text-white/70 text-lg mb-6">
              I'm giving away <strong className="text-white">5 completely free custom websites</strong> to people with business ideas worth building. Here's how it works:
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-brand-pink/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-black text-brand-pink">1</span>
                </div>
                <h3 className="font-semibold text-white mb-2">Book a Call</h3>
                <p className="text-sm text-white/60">Schedule a free discovery call with me</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-brand-orange/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-black text-brand-orange">2</span>
                </div>
                <h3 className="font-semibold text-white mb-2">Pitch Your Idea</h3>
                <p className="text-sm text-white/60">Tell me about your business and vision</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-brand-yellow/20 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl font-black text-brand-yellow">3</span>
                </div>
                <h3 className="font-semibold text-white mb-2">Get Built</h3>
                <p className="text-sm text-white/60">If selected, I build your site + logo FREE</p>
              </div>
            </div>
            
            <div className="bg-white/5 rounded-xl p-6 mb-8">
              <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Gift className="w-5 h-5 text-brand-pink" />
                What's Included (For Winners):
              </h4>
              <ul className="grid md:grid-cols-2 gap-3">
                {[
                  'Custom website design & development',
                  'Logo creation or revision (30 mins)',
                  'Mobile-responsive design',
                  'Basic SEO setup',
                  'Hosting setup assistance',
                  'Brand color palette'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-white/70">
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://cal.com/machine-mind/discovery"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 btn-primary py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Book Your Pitch Call
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            
            <p className="text-center text-white/40 text-sm mt-4">
              Only 5 spots available. Decisions made by Feb 15.
            </p>
          </div>
        </div>
      </section>

      {/* Email Capture Section */}
      <section ref={notifyRef} id="notify" className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="glass-card rounded-3xl p-8 md:p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-pink to-brand-purple flex items-center justify-center mx-auto mb-6">
              <Zap className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              Don't Miss Out
            </h2>
            <p className="text-white/60 mb-8">
              Get notified when each tool drops. First access. No spam.
            </p>
            
            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-6 py-4 rounded-xl text-white placeholder:text-white/40 text-lg"
                  disabled={isSubmitting}
                />
                
                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full btn-primary py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      Notify Me <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                
                <p className="text-white/40 text-sm">
                  Join {subscriberCount.toLocaleString()}+ people already signed up
                </p>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">You're In! 🎉</h3>
                  <p className="text-white/60">Check your inbox for confirmation.</p>
                </div>
                
                {/* Follow on Instagram */}
                <div className="pt-6 border-t border-white/10">
                  <p className="text-white/70 mb-4">Follow me for updates and bonus content:</p>
                  
                  <a
                    href="https://instagram.com/showowt"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Instagram className="w-5 h-5" />
                    @showowt
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-6">
            WHO'S BUILDING ALL THIS?
          </h2>
          
          <p className="text-lg text-white/70 mb-6">
            I'm the founder of <strong className="text-white">MachineMind</strong> — we build AI automation systems for businesses.
            Last week I built a complete property accounting platform (that would cost $150K to develop) in under 3 hours.
          </p>
          
          <p className="text-xl text-brand-pink mb-8">
            This week, I'm giving that power away for free.
          </p>
          
          <a 
            href="https://instagram.com/showowt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-6 py-3 rounded-xl glass-card glass-card-hover"
          >
            <Instagram className="w-6 h-6" />
            <span className="font-semibold">@showowt</span>
          </a>
        </div>
      </section>

      {/* CTA for Business */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative glass-card rounded-3xl p-8 md:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-pink/20 to-brand-purple/20 pointer-events-none" />
            
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <Rocket className="w-8 h-8 text-brand-pink" />
                <span className="text-sm font-semibold text-brand-pink uppercase tracking-wider">For Businesses</span>
              </div>
              
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                Want Something Like This Built For YOUR Business?
              </h2>
              
              <p className="text-lg text-white/70 mb-8">
                These free tools are just a taste. We build complete AI automation systems that save businesses 
                <strong className="text-white"> $2,000-8,000/month</strong> in recovered revenue and time savings.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <a 
                  href="https://cal.com/machine-mind/discovery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary px-8 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  Book a Discovery Call
                  <ExternalLink className="w-4 h-4" />
                </a>
                <a 
                  href="https://www.machinemindconsulting.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 rounded-xl font-semibold text-lg glass-card glass-card-hover flex items-center justify-center gap-2"
                >
                  Learn More About MachineMind
                  <ArrowRight className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-brand-pink" />
              <span className="font-bold text-white">MachineMind</span>
            </div>
            
            <div className="flex items-center gap-6">
              <a 
                href="https://instagram.com/showowt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors flex items-center gap-2"
              >
                <Instagram className="w-5 h-5" />
                <span className="text-sm">@showowt</span>
              </a>
            </div>
            
            <p className="text-white/40 text-sm">
              © 2026 MachineMind. Building the future, one tool at a time.
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
