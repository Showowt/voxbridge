import type { Metadata, Viewport } from 'next'
import './globals.css'

const APP_NAME = 'VoxLink'
const APP_TITLE = 'VoxLink™ - Real-Time Voice Translation'
const APP_DESCRIPTION = 'Break language barriers instantly. Free real-time voice translation between English and Spanish. Video calls with live subtitles, chat translation, and voice message translation. No sign up required.'
const APP_URL = 'https://voxbridge-kappa.vercel.app'

export const metadata: Metadata = {
  // Basic
  title: {
    default: APP_TITLE,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,

  // Keywords for SEO
  keywords: [
    'translation app',
    'voice translation',
    'real-time translation',
    'video call translation',
    'Spanish English translator',
    'live translator',
    'free translation',
    'instant translation',
    'language barrier',
    'VoxLink',
    'MachineMind',
  ],

  // Authors
  authors: [{ name: 'MachineMind', url: 'https://machinemindconsulting.com' }],
  creator: 'MachineMind',
  publisher: 'MachineMind',

  // Canonical URL
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: '/',
  },

  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'es_ES',
    url: APP_URL,
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'VoxLink - Break Language Barriers Instantly',
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    images: ['/twitter-image'],
    creator: '@machinemind',
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Icons
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },

  // PWA Manifest
  manifest: '/manifest.json',

  // Apple Web App
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_NAME,
  },

  // Verification (add your own)
  // verification: {
  //   google: 'your-google-verification-code',
  // },

  // Category
  category: 'technology',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0a0a0f' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {/* PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />

        {/* Performance hints */}
        <link rel="preconnect" href="https://api.mymemory.translated.net" />
        <link rel="preconnect" href="https://0.peerjs.com" />
        <link rel="dns-prefetch" href="https://api.mymemory.translated.net" />
        <link rel="dns-prefetch" href="https://0.peerjs.com" />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'VoxLink',
              alternateName: 'MachineMind VoxLink',
              description: APP_DESCRIPTION,
              url: APP_URL,
              applicationCategory: 'CommunicationApplication',
              operatingSystem: 'Any',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              featureList: [
                'Real-time voice translation',
                'Video calls with live subtitles',
                'Chat translation',
                'Voice message translation',
                'English to Spanish translation',
                'Spanish to English translation',
              ],
              creator: {
                '@type': 'Organization',
                name: 'MachineMind',
                url: 'https://machinemindconsulting.com',
              },
            }),
          }}
        />
      </head>
      <body className="safe-top safe-bottom antialiased">{children}</body>
    </html>
  )
}
