import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'VoxLink - Break Language Barriers Instantly'
export const size = { width: 1200, height: 630 }
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Animated gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -150,
            right: -150,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '10%',
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {/* Logo icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              boxShadow: '0 20px 60px rgba(6,182,212,0.4)',
              marginBottom: 30,
              fontSize: 60,
            }}
          >
            🔗
          </div>

          {/* Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: '#06b6d4',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
              }}
            >
              MachineMind
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: 'white',
              margin: 0,
              marginBottom: 20,
              textShadow: '0 4px 30px rgba(0,0,0,0.5)',
            }}
          >
            VoxLink™
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontSize: 32,
              color: '#94a3b8',
              margin: 0,
              marginBottom: 40,
            }}
          >
            Break Language Barriers Instantly
          </p>

          {/* Feature pills */}
          <div
            style={{
              display: 'flex',
              gap: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 50,
                background: 'rgba(6,182,212,0.15)',
                border: '1px solid rgba(6,182,212,0.3)',
              }}
            >
              <span style={{ fontSize: 24 }}>📹</span>
              <span style={{ fontSize: 18, color: '#06b6d4', fontWeight: 600 }}>Video Calls</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 50,
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)',
              }}
            >
              <span style={{ fontSize: 24 }}>💬</span>
              <span style={{ fontSize: 18, color: '#22c55e', fontWeight: 600 }}>Live Chat</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 24px',
                borderRadius: 50,
                background: 'rgba(168,85,247,0.15)',
                border: '1px solid rgba(168,85,247,0.3)',
              }}
            >
              <span style={{ fontSize: 24 }}>🎤</span>
              <span style={{ fontSize: 18, color: '#a855f7', fontWeight: 600 }}>Voice Translation</span>
            </div>
          </div>

          {/* Language flags */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              marginTop: 40,
            }}
          >
            <span style={{ fontSize: 48 }}>🇺🇸</span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#06b6d4',
                fontSize: 24,
              }}
            >
              <span>⟷</span>
            </div>
            <span style={{ fontSize: 48 }}>🇪🇸</span>
          </div>
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 32px',
            borderRadius: 50,
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            boxShadow: '0 10px 40px rgba(6,182,212,0.3)',
          }}
        >
          <span style={{ fontSize: 20, color: 'white', fontWeight: 700 }}>
            Free • No Sign Up • Works Instantly
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
