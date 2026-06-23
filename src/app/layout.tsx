import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister'
import { localeDir } from '@/i18n/config'
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
