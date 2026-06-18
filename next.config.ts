import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Single-container deploy: emit a self-contained server bundle.
  output: 'standalone',
  // Disk-mirror + uploads live outside .next; keep server actions lenient on body size.
  experimental: {
    serverActions: { bodySizeLimit: '25mb' },
  },
}

export default nextConfig
