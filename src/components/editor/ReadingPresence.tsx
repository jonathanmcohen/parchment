'use client'

import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { Editor } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { collectReaders, type Reader, throttle } from '@/lib/editor/reading-presence'

type Props = {
  editor: Editor
  provider: HocuspocusProvider
  /** the wrapper element the markers are absolutely positioned within */
  containerRef: React.RefObject<HTMLDivElement | null>
  onReadersChange?: (readers: Reader[]) => void
}

export function ReadingPresence({ editor, provider, containerRef, onReadersChange }: Props) {
  const [readers, setReaders] = useState<Reader[]>([])
  const onReadersChangeRef = useRef(onReadersChange)
  onReadersChangeRef.current = onReadersChange

  // Subscribe to awareness changes
  useEffect(() => {
    const awareness = provider.awareness
    if (!awareness) return

    const update = () => {
      const next = collectReaders(
        awareness.getStates() as Map<number, Record<string, unknown>>,
        awareness.clientID,
        Date.now(),
      )
      setReaders(next)
      onReadersChangeRef.current?.(next)
    }

    awareness.on('change', update)
    // Initial compute
    update()

    return () => {
      awareness.off('change', update)
    }
  }, [provider])

  // Recompute marker positions on scroll/resize/transactions
  const [, setTick] = useState(0)
  useEffect(() => {
    const recompute = throttle(() => {
      setTick((t) => t + 1)
    }, 100)

    const onScroll = () => recompute()
    const onResize = () => recompute()

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })

    const onTransaction = () => recompute()
    editor.on('transaction', onTransaction)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      editor.off('transaction', onTransaction)
      recompute.cancel()
    }
  }, [editor])

  if (readers.length === 0) return null

  const containerEl = containerRef.current
  const containerRect = containerEl?.getBoundingClientRect()
  const containerHeight = containerEl?.offsetHeight ?? 0

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: -28,
        width: 24,
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {readers.map((reader) => {
        let top: number | null = null
        try {
          const c = editor.view.coordsAtPos(reader.pos)
          if (containerRect) {
            const raw = c.top - containerRect.top
            top = Math.max(0, Math.min(raw, containerHeight - 20))
          }
        } catch {
          // stale pos during remote edits — skip this marker
          return null
        }

        if (top === null) return null

        const initial = reader.user.name[0]?.toUpperCase() ?? '?'

        const handleClick = () => {
          try {
            const { node } = editor.view.domAtPos(reader.pos)
            // domAtPos may return a text node (no scrollIntoView) — resolve to
            // its parent element so the jump actually scrolls.
            const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
            el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
          } catch {
            // position transiently invalid — do nothing
          }
        }

        return (
          <button
            key={reader.clientId}
            type="button"
            aria-label={`Jump to where ${reader.user.name} is reading`}
            title={reader.user.name}
            onClick={handleClick}
            style={{
              position: 'absolute',
              top,
              left: 2,
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: reader.user.color,
              color: '#ffffff',
              border: '1.5px solid var(--border)',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              pointerEvents: 'auto',
              lineHeight: 1,
              padding: 0,
            }}
          >
            {initial}
          </button>
        )
      })}
    </div>
  )
}
