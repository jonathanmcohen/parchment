import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { issuePat, listPats } from '@/lib/auth/pat'

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

  const issued = await issuePat(user.id, name)
  return NextResponse.json(
    { id: issued.id, name: issued.name, tokenPrefix: issued.tokenPrefix, token: issued.token },
    { status: 201 },
  )
}
