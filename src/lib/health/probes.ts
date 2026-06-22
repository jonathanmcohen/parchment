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

const PROBE_TIMEOUT_MS = 3000

// Ollama/AI endpoint — configured-only: returns null when AI_BASE_URL is unset.
// I6: probeOllama is resilient — never throws; a fetch failure → 'down' pill.
export async function probeOllama(): Promise<Pill | null> {
  const base = process.env.AI_BASE_URL
  if (!base) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    // Try the /models endpoint (OpenAI-compatible / Ollama list-models).
    // Any HTTP response (even 4xx) means the server is reachable.
    await fetch(`${base}/models`, { signal: controller.signal })
    return { name: 'ollama', status: 'up', detail: base }
  } catch (e) {
    return { name: 'ollama', status: 'down', detail: `${base} — ${message(e)}` }
  } finally {
    clearTimeout(timer)
  }
}

// S3 backup endpoint — configured-only: returns null when BACKUP_S3_ENDPOINT is unset.
// I6: probeS3 is resilient — never throws; a fetch failure → 'down' pill.
export async function probeS3(): Promise<Pill | null> {
  const endpoint = process.env.BACKUP_S3_ENDPOINT
  if (!endpoint) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    // Lightweight reachability check — HEAD the endpoint root.
    // Any HTTP response (even 4xx/5xx) means the host is reachable.
    await fetch(endpoint, { method: 'HEAD', signal: controller.signal })
    return { name: 's3', status: 'up', detail: endpoint }
  } catch (e) {
    return { name: 's3', status: 'down', detail: `${endpoint} — ${message(e)}` }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeAll(): Promise<Pill[]> {
  const results = await Promise.all([
    probeDatabase(),
    probeCollab(),
    probeSearchIndex(),
    probeDisk(),
    probeOllama(),
    probeS3(),
  ])
  // Filter out nulls from configured-only probes (Ollama, S3 when env is unset).
  return results.filter((p): p is Pill => p !== null)
}
