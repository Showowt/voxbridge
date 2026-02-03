import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MachineMind VoxLink™ - Real-Time Voice Translation',
  description: 'Break language barriers instantly. Free real-time voice translation between English and Spanish. Video calls, face-to-face mode, and WhatsApp voice message translation. Powered by MachineMind.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VoxLink',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="safe-top safe-bottom">{children}</body>
    </html>
  )
}
