import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { addGoogleFont, getGoogleFonts, removeGoogleFont } from '@/lib/docs/settings-repo'
import { isAllowedGoogleFont } from '@/lib/fonts/google-catalog'

// v0.2.7 #4b: the owner's PICKED Google fonts list. GET lists them; POST adds one;
// DELETE removes one. Every write is allow-list-gated (the SSRF allow-list is the
// single source of truth) so a forged family is a 400, never a stored reference.

export const dynamic = 'force-dynamic'

/** GET /api/settings/fonts → { fonts: string[] } */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  return NextResponse.json({ fonts: await getGoogleFonts(auth.user.id) })
}

/** POST /api/settings/fonts { family } → { ok, fonts } (adds a catalogue font). */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)

  let body: { family?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const family = typeof body.family === 'string' ? body.family : ''
  if (!isAllowedGoogleFont(family)) {
    return NextResponse.json({ error: 'unknown_font' }, { status: 400 })
  }
  const fonts = await addGoogleFont(auth.user.id, family)
  return NextResponse.json({ ok: true, fonts })
}

/** DELETE /api/settings/fonts { family } → { ok, fonts } (removes a picked font). */
export async function DELETE(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)

  let body: { family?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const family = typeof body.family === 'string' ? body.family : ''
  const fonts = await removeGoogleFont(auth.user.id, family)
  return NextResponse.json({ ok: true, fonts })
}
