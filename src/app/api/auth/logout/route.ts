import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth/session'

// Clears the current session (deletes the row + unsets the cookie). POST only —
// a GET would be CSRF-triggerable from a third-party page.
export async function POST() {
  await destroySession()
  return NextResponse.json({ ok: true })
}
