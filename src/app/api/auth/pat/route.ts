import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { issuePat, listPats } from '@/lib/auth/pat'
import { normalizeScopes } from '@/lib/auth/scopes'

// PAT management is owner-only and guarded by a live session — a PAT cannot mint
// or list other PATs (use the cookie session in Developer settings).
async function requireSessionUser(req: NextRequest) {
  // Bearer (PAT) auth is intentionally excluded here: only the session path.
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ')
  if (hasBearer) return null
  return authenticateRequest(req)
}

// GET /api/auth/pat — list token metadata (never the plaintext token).
export async function GET(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const pats = await listPats(user.id)
  return NextResponse.json({ pats })
}

// POST /api/auth/pat — create a token; the plaintext is returned exactly once.
export async function POST(req: NextRequest) {
  const user = await requireSessionUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? String((body as { name: unknown }).name ?? '').trim()
      : ''

  if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 })

  // J8: scopes from the request, coerced to the canonical set (bare 'read'/'write'
  // and unknowns are dropped). Default to docs:read when none/invalid are supplied so
  // a token is never accidentally minted with zero capability.
  const rawScopes =
    typeof body === 'object' && body !== null && 'scopes' in body
      ? (body as { scopes: unknown }).scopes
      : []
  let scopes = normalizeScopes(rawScopes)
  if (scopes.length === 0) scopes = ['docs:read']

  const issued = await issuePat(user.id, name, scopes)
  return NextResponse.json(
    {
      id: issued.id,
      name: issued.name,
      tokenPrefix: issued.tokenPrefix,
      scopes: issued.scopes,
      token: issued.token,
    },
    { status: 201 },
  )
}
