'use client'

// v0.2.7 #4b: on-demand Google Fonts picker. Search the bundled catalogue and pick
// a font WHEN you choose to. PRIVACY: previews + the applied font are self-hosted —
// every visible result gets a local @font-face (via GoogleFontsStyle) pointing at
// /api/fonts/google/<slug>.woff2, so the browser fetches woff2 from THIS origin (the
// server proxies+caches from Google once), never from fonts.gstatic.com.

import { useMemo, useState } from 'react'
import { GoogleFontsStyle } from '@/components/editor/GoogleFontsStyle'
import { searchGoogleFonts } from '@/lib/fonts/google-catalog'
import { googleFontStack } from '@/lib/fonts/google-fonts'

interface Props {
  /** Apply a picked font: persists it workspace-wide AND sets it on the selection. */
  onPick: (family: string) => void
  onClose: () => void
}

export function FontPicker({ onPick, onClose }: Props) {
  const [query, setQuery] = useState('')
  // Cap the live-previewed set so we don't inject hundreds of @font-face at once
  // (each triggers a server fetch on first paint). The catalogue search already
  // caps; we preview the first chunk and the rest render in a fallback face.
  const results = useMemo(() => searchGoogleFonts(query, 48), [query])
  const previewed = results.slice(0, 24)

  return (
    <div
      className="parchment-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Add a Google font"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      {/* Self-hosted previews for the visible results. */}
      <GoogleFontsStyle families={previewed} />
      <div className="parchment-dialog parchment-font-picker" style={{ maxWidth: 460 }}>
        <div className="parchment-dialog-header">
          <span className="parchment-dialog-title">Add a font</span>
          <button
            type="button"
            className="parchment-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <p className="parchment-font-picker-note">
          Search Google Fonts. The font is fetched once by your Parchment server and self-hosted —
          your browser never loads anything from Google.
        </p>

        <input
          type="search"
          className="parchment-dialog-input"
          // biome-ignore lint/a11y/noAutofocus: a search picker should focus its field on open.
          autoFocus
          placeholder="Search fonts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search Google Fonts"
        />

        <ul className="parchment-font-picker-list">
          {results.length === 0 && <li className="parchment-font-picker-empty">No matches.</li>}
          {results.map((family, i) => (
            <li key={family}>
              <button
                type="button"
                className="parchment-font-picker-item"
                onClick={() => onPick(family)}
                // Only the previewed chunk has its @font-face injected; the rest
                // render the label in the fallback face (still selectable).
                style={i < previewed.length ? { fontFamily: googleFontStack(family) } : undefined}
              >
                {family}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
