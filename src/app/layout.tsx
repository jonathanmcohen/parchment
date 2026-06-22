import type { Metadata, Viewport } from 'next'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parchment',
  description: 'Markdown-first writing, page-bounded canvas, self-hosted.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Parchment',
  },
}

export const viewport: Viewport = {
  themeColor: '#7c5cff',
  width: 'device-width',
  initialScale: 1,
  // G12: pinch-zoom is intentionally NOT disabled — maximumScale and
  // userScalable are omitted to preserve accessibility zooming.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
