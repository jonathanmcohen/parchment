import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { localeDir } from '@/i18n/config'
import './globals.css'
// v0.1.10 #11/#12/#13: true content-splitting pagination styles (sheets + native
// print). Kept in a separate file so it never touches the continuous-mode canvas.
import '@/styles/pagination.css'

export const metadata: Metadata = {
  title: 'Parchment',
  description: 'Parchment — your documents, on your disk.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Parchment',
  },
}

export const viewport: Viewport = {
  // S1-1: Google-Docs brand blue (static manifest value, outside the CSS-var system).
  themeColor: '#1A73E8',
  width: 'device-width',
  initialScale: 1,
  // G12: pinch-zoom is intentionally NOT disabled — maximumScale and
  // userScalable are omitted to preserve accessibility zooming.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // K5: locale + messages come from next-intl's cookie-based request config.
  // `lang`/`dir` are set here so the entire shell (and RTL mirroring) is correct
  // from the first server-rendered byte; NextIntlClientProvider hands the active
  // catalog to client components (useTranslations) below.
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html lang={locale} dir={localeDir(locale)}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
