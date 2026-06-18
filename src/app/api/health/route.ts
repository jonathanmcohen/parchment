import { NextResponse } from 'next/server'
import { probeAll } from '@/lib/health/probes'

export const dynamic = 'force-dynamic'

// A5 / I6 — health pills. Every probe is resilient and returns a Pill; a probe
// failure surfaces as a 'down' pill rather than throwing the whole handler.
export async function GET() {
  const pills = await probeAll()
  const ok = pills.every((p) => p.status !== 'down')
  return NextResponse.json({ ok, pills }, { status: ok ? 200 : 503 })
}
