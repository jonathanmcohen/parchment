'use client'

import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/shell/Avatar'
import { type Participant, presenceCluster } from '@/lib/editor/reading-presence'

// H Task 14 — the title-bar avatar cluster of who is editing/viewing this doc,
// driven by Yjs awareness. Subscribes to provider.awareness 'change' and renders up
// to MAX avatars (coloured by the participant's awareness colour) + a "+k" overflow
// chip. An editing participant gets a subtle ring; a viewing one does not. Each
// avatar carries a name title/aria-label and a viewing/editing affordance.

const MAX = 4

export function PresenceCluster({ provider }: { provider: HocuspocusProvider | null }) {
  const [participants, setParticipants] = useState<Participant[]>([])

  useEffect(() => {
    const awareness = provider?.awareness
    if (!awareness) return
    const update = () => {
      setParticipants(
        presenceCluster(
          awareness.getStates() as Map<number, Record<string, unknown>>,
          awareness.clientID,
          Date.now(),
        ),
      )
    }
    awareness.on('change', update)
    update()
    return () => {
      awareness.off('change', update)
    }
  }, [provider])

  if (participants.length === 0) return null

  const shown = participants.slice(0, MAX)
  const overflow = participants.length - shown.length

  return (
    // Each avatar child is a labelled role="img", so the cluster is accessible
    // without a redundant container label/role.
    <div className="parchment-presence-cluster flex items-center">
      {shown.map((p, i) => (
        <span
          key={p.name}
          role="img"
          className="parchment-presence-avatar"
          title={`${p.name} — ${p.editing ? 'editing' : 'viewing'}`}
          aria-label={`${p.name}, ${p.editing ? 'editing' : 'viewing'}`}
          style={{
            // Overlap avatars slightly; the editing ring uses the participant colour.
            marginInlineStart: i === 0 ? 0 : -8,
            borderRadius: '9999px',
            outline: p.editing ? `2px solid ${p.color}` : '2px solid var(--surface)',
            boxShadow: '0 0 0 1px var(--surface)',
            zIndex: shown.length - i,
          }}
        >
          <Avatar name={p.name} size={28} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          role="img"
          className="parchment-presence-overflow ms-1 inline-flex items-center justify-center rounded-full text-[11px]"
          style={{
            width: 28,
            height: 28,
            background: 'var(--surface-2, var(--surface))',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
          }}
          title={`${overflow} more`}
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
