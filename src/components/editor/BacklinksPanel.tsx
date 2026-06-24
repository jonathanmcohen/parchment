'use client'

import { useCallback, useEffect, useState } from 'react'

// F6: backlinks panel — lists the documents that link to the current doc via
// [[wiki]] links. Fetches /api/docs/[id]/backlinks; each row links to /d/[id].
// Client component — does NOT import @/db (data arrives over the API).

type Backlink = { id: string; title: string }

interface Props {
  docId: string
}

export function BacklinksPanel({ docId }: Props) {
  const [links, setLinks] = useState<Backlink[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/docs/${docId}/backlinks`)
      if (!res.ok) return
      const rows = (await res.json()) as Backlink[]
      setLinks(Array.isArray(rows) ? rows : [])
    } catch {
      // panel is non-critical
    } finally {
      setLoaded(true)
    }
  }, [docId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <aside
      aria-label="Backlinks"
      style={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border, #e5e7eb)',
        background: 'var(--surface, #fff)',
        overflowY: 'auto',
        padding: '8px 0',
        maxHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px 8px',
          borderBottom: '1px solid var(--border, #e5e7eb)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Backlinks</span>
      </div>

      {loaded && links.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted, #6b7280)', padding: '12px' }}>
          No documents link here.
        </p>
      )}

      {links.length > 0 && (
        <ul
          aria-label="Linking documents"
          style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, overflowY: 'auto' }}
        >
          {links.map((link) => (
            <li key={link.id} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <a
                href={`/d/${link.id}`}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  fontSize: 13,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={link.title}
              >
                {link.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
