import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Parchment',
  description: 'Markdown-first writing, page-bounded canvas, self-hosted.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
