import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// K5: point next-intl at the cookie-based request config (no i18n routing).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  // Single-container deploy: emit a self-contained server bundle.
  output: 'standalone',
  // Disk-mirror + uploads live outside .next; keep server actions lenient on body size.
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
}

export default withNextIntl(nextConfig)
