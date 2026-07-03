import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Parchment',
    short_name: 'Parchment',
    description: 'Parchment — your documents, on your disk.',
    // Launch straight into the file list (the app home). '/' only redirects here.
    start_url: '/files',
    display: 'standalone',
    // Match the fixed chrome tokens in src/styles/tokens.css (--background /
    // --primary); these drive the OS splash + status-bar tint when installed.
    background_color: '#FFFFFF',
    theme_color: '#1A73E8',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
