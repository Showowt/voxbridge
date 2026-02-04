import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VoxLink - Break Language Barriers Instantly'
export const size = { width: 1200, height: 600 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '60px 80px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background effects */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -200,
            left: -100,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Left content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10,
            maxWidth: '60%',
          }}
        >
          {/* Brand */}
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#06b6d4',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            MachineMind
          </span>

          {/* Title */}
          <h1
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: 'white',
              margin: 0,
              marginBottom: 16,
              lineHeight: 1.1,
            }}
          >
            VoxLink™
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontSize: 28,
              color: '#94a3b8',
              margin: 0,
              marginBottom: 32,
            }}
          >
            Break Language Barriers Instantly
          </p>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>📹</span>
              <span style={{ fontSize: 16, color: '#06b6d4' }}>Video Calls</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <span style={{ fontSize: 16, color: '#22c55e' }}>Live Chat</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🎤</span>
              <span style={{ fontSize: 16, color: '#a855f7' }}>Voice</span>
            </div>
          </div>
        </div>

        {/* Right - Logo and flags */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            zIndex: 10,
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 140,
              height: 140,
              borderRadius: 35,
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              boxShadow: '0 20px 60px rgba(6,182,212,0.4)',
              fontSize: 70,
            }}
          >
            🔗
          </div>

          {/* Flags */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 40 }}>🇺🇸</span>
            <span style={{ fontSize: 20, color: '#06b6d4' }}>⟷</span>
            <span style={{ fontSize: 40 }}>🇪🇸</span>
          </div>

          {/* Free badge */}
          <div
            style={{
              padding: '10px 24px',
              borderRadius: 50,
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              fontSize: 16,
              color: 'white',
              fontWeight: 700,
            }}
          >
            FREE • NO SIGN UP
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
