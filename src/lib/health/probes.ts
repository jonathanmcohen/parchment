import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { env } from '@/lib/env'

export type PillStatus = 'up' | 'down' | 'unknown'
export type Pill = { name: string; status: PillStatus; detail?: string }

const COLLAB_TIMEOUT_MS = 1500

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// Database — SELECT 1 round-trip.
export async function probeDatabase(): Promise<Pill> {
  try {
    await db.execute(sql`select 1`)
    return { name: 'database', status: 'up' }
  } catch (e) {
    return { name: 'database', status: 'down', detail: message(e) }
  }
}

// Collab — reach the Hocuspocus HTTP port derived from the configured ws URL.
function collabHttpUrl(): string {
  // env.collabUrl is a websocket URL (ws://host:port). Reuse its host, swap to
  // http, and use the explicit collab port so the probe targets the same server.
  let host = 'localhost'
  try {
    host = new URL(env.collabUrl).hostname || 'localhost'
  } catch {
    // Fall back to localhost for a malformed/relative COLLAB_URL.
  }
  return `http://${host}:${env.collabPort}`
}

export async function probeCollab(): Promise<Pill> {
  const url = collabHttpUrl()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), COLLAB_TIMEOUT_MS)
  try {
    // Any HTTP response (even a 4xx upgrade-required) means the server is live.
    await fetch(url, { signal: controller.signal })
    return { name: 'collab', status: 'up', detail: url }
  } catch (e) {
    return { name: 'collab', status: 'down', detail: `${url} — ${message(e)}` }
  } finally {
    clearTimeout(timer)
  }
}

// Search index — confirm the GIN full-text index exists.
export async function probeSearchIndex(): Promise<Pill> {
  try {
    const rows = await db.execute(
      sql`select 1 from pg_indexes where indexname = 'documents_search_idx' limit 1`,
    )
    const found = Array.isArray(rows) ? rows.length > 0 : (rows.rowCount ?? 0) > 0
    return found
      ? { name: 'search-index', status: 'up', detail: 'documents_search_idx' }
      : { name: 'search-index', status: 'down', detail: 'documents_search_idx missing' }
  } catch (e) {
    return { name: 'search-index', status: 'down', detail: message(e) }
  }
}

// Disk — confirm the files root is writable via a temp directory under it.
export async function probeDisk(): Promise<Pill> {
  const root = env.filesRoot
  let scratch: string | undefined
  try {
    scratch = await mkdtemp(join(root, '.health-'))
    return { name: 'disk', status: 'up', detail: root }
  } catch (e) {
    // Unwritable or missing root — report the configured path with the reason.
    return { name: 'disk', status: 'down', detail: `${root} — ${message(e)}` }
  } finally {
    if (scratch) {
      try {
        await rm(scratch, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup; a leftover temp dir must not flip the probe.
      }
    }
  }
}

export async function probeAll(): Promise<Pill[]> {
  return Promise.all([probeDatabase(), probeCollab(), probeSearchIndex(), probeDisk()])
}
