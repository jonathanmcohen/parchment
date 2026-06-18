import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

type Pill = { name: string; status: 'up' | 'down' | 'unknown'; detail?: string }

// A5 / I6 — health pills. v0.1 wires DB for real; collab/disk/search probed in later plans.
export async function GET() {
  const pills: Pill[] = []

  // DB
  try {
    await db.execute(sql`select 1`)
    pills.push({ name: 'database', status: 'up' })
  } catch (e) {
    pills.push({ name: 'database', status: 'down', detail: (e as Error).message })
  }

  // Collab (reachability probe added with Plan D; report configured target for now)
  pills.push({ name: 'collab', status: 'unknown', detail: env.collabUrl })

  // Disk mirror (Plan F)
  pills.push({ name: 'search-index', status: 'unknown' })
  pills.push({ name: 'disk', status: 'unknown', detail: env.filesRoot })

  const ok = pills.every((p) => p.status !== 'down')
  return NextResponse.json({ ok, pills }, { status: ok ? 200 : 503 })
}
