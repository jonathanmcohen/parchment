export interface ReaderUser {
  name: string
  color: string
}

/** A remote user's published reading state. */
export interface ReadingState {
  /** ProseMirror doc position nearest the vertical center of their viewport. */
  pos: number
  /** epoch ms when last updated (for staleness). */
  updatedAt: number
}

/** One remote reader resolved from awareness. */
export interface Reader {
  clientId: number
  user: ReaderUser
  pos: number
}

/**
 * Reduce an awareness state map to the list of remote readers.
 * - excludes `selfClientId`
 * - requires both a `user` (with a name) and a `reading.pos` (finite number)
 * - drops states older than `staleMs` (default 30_000) measured against `now`
 * - sorted ascending by pos (document order), then by clientId for stability
 */
export function collectReaders(
  states: Map<number, Record<string, unknown>>,
  selfClientId: number,
  now: number,
  staleMs = 30_000,
): Reader[] {
  const readers: Reader[] = []

  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue

    const user = state.user
    if (
      !user ||
      typeof user !== 'object' ||
      typeof (user as Record<string, unknown>).name !== 'string' ||
      ((user as Record<string, unknown>).name as string).length === 0
    ) {
      continue
    }

    const reading = state.reading
    if (
      !reading ||
      typeof reading !== 'object' ||
      !Number.isFinite((reading as Record<string, unknown>).pos as number) ||
      typeof (reading as Record<string, unknown>).pos !== 'number'
    ) {
      continue
    }

    const updatedAt = (reading as Record<string, unknown>).updatedAt
    if (updatedAt !== undefined && updatedAt !== null) {
      if (typeof updatedAt !== 'number' || now - updatedAt > staleMs) {
        continue
      }
    }

    const userName = (user as Record<string, unknown>).name as string
    const userColor = (user as Record<string, unknown>).color
    const color = typeof userColor === 'string' ? userColor : '#888888'
    const pos = (reading as Record<string, unknown>).pos as number

    readers.push({ clientId, user: { name: userName, color }, pos })
  }

  readers.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos
    return a.clientId - b.clientId
  })

  return readers
}

// ── Presence cluster (Task 14) ─────────────────────────────────────────────

/** One participant in the avatar cluster. */
export interface Participant {
  name: string
  color: string
  /** true = actively editing (has a recent caret/selection); false = viewing. */
  editing: boolean
}

/**
 * Reduce an awareness state map to the de-duplicated list of live participants for
 * the title-bar avatar cluster.
 *   • excludes `selfClientId`
 *   • requires a `user.name` (drops nameless/user-less states)
 *   • `editing` = the state carries a CollaborationCaret `cursor`/`selection` field
 *     (a fresh one, when it has an `updatedAt`); otherwise the participant is
 *     `viewing` (reading-only or merely present)
 *   • de-duplicated by name (the same user open in two tabs shows once), preferring
 *     an editing entry over a viewing one
 *   • sorted by name for stable rendering
 */
export function presenceCluster(
  states: Map<number, Record<string, unknown>>,
  selfClientId: number,
  now: number,
  staleMs = 30_000,
): Participant[] {
  const byName = new Map<string, Participant>()

  for (const [clientId, state] of states) {
    if (clientId === selfClientId) continue

    const user = state.user
    if (
      !user ||
      typeof user !== 'object' ||
      typeof (user as Record<string, unknown>).name !== 'string' ||
      ((user as Record<string, unknown>).name as string).length === 0
    ) {
      continue
    }

    const name = (user as Record<string, unknown>).name as string
    const rawColor = (user as Record<string, unknown>).color
    const color = typeof rawColor === 'string' ? rawColor : '#888888'

    // editing = a CollaborationCaret cursor/selection field is present (and fresh
    // when it carries an updatedAt). The caret extension publishes `cursor`; we also
    // accept `selection` defensively.
    const caret =
      (state.cursor as Record<string, unknown> | undefined) ??
      (state.selection as Record<string, unknown> | undefined)
    let editing = false
    if (caret && typeof caret === 'object') {
      const updatedAt = caret.updatedAt
      editing = typeof updatedAt === 'number' ? now - updatedAt <= staleMs : true
    }

    const existing = byName.get(name)
    if (!existing) {
      byName.set(name, { name, color, editing })
    } else if (editing && !existing.editing) {
      // Prefer the editing entry when the same user appears twice (two tabs).
      byName.set(name, { name, color, editing: true })
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Trailing+leading throttle. Returns a function with a `.cancel()` method. */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A | null = null
  let leadingFired = false

  const throttled = (...args: A): void => {
    if (!leadingFired) {
      // Leading edge: fire immediately
      leadingFired = true
      fn(...args)
      // Start cooldown window
      timer = setTimeout(() => {
        timer = null
        leadingFired = false
        // Fire trailing if there were calls during cooldown
        if (lastArgs !== null) {
          const a = lastArgs
          lastArgs = null
          throttled(...a)
        }
      }, ms)
    } else {
      // Within cooldown: store latest args for trailing call
      lastArgs = args
    }
  }

  throttled.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    lastArgs = null
    leadingFired = false
  }

  return throttled
}
