import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { buildShareUrl } from '@/lib/docs/share-link'
import { createShare, listShares, PERMISSIONS, type Permission } from '@/lib/docs/shares-repo'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

// CF4: build the copyable share link from the FIXED public base URL (env.publicUrl
// = PUBLIC_URL || PARCHMENT_RP_ORIGIN), NOT req.nextUrl.origin. Behind Caddy the
// request origin is the internal 0.0.0.0:3000 bind, which would leak into the link.
function shareUrl(token: string): string {
  return buildShareUrl(env.publicUrl, token)
}

function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value)
}

// GET /api/docs/[id]/shares — list the doc's shares (owner-only). Maps each row
// to a safe client shape: NEVER sends passwordHash; exposes only hasPassword.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const shares = await listShares(user.id, id)
  return NextResponse.json(
    shares.map((s) => ({
      id: s.id,
      token: s.token,
      permission: s.permission,
      hasPassword: s.passwordHash !== null,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      url: shareUrl(s.token),
    })),
  )
}

// POST /api/docs/[id]/shares — create a share (owner-only).
// Body: { permission, password?, expiresAt? (ISO string | null) }.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as {
    permission?: unknown
    password?: unknown
    expiresAt?: unknown
  }

  const permission: Permission = isPermission(body.permission) ? body.permission : 'view'
  const password =
    typeof body.password === 'string' && body.password.length > 0 ? body.password : undefined

  // Parse expiry: accept an ISO string; reject an invalid/past date with 400.
  let expiresAt: Date | null = null
  if (typeof body.expiresAt === 'string' && body.expiresAt.length > 0) {
    const parsed = new Date(body.expiresAt)
    if (Number.isNaN(parsed.getTime()))
      return NextResponse.json({ error: 'invalid_expiry' }, { status: 400 })
    if (parsed.getTime() <= Date.now())
      return NextResponse.json({ error: 'invalid_expiry' }, { status: 400 })
    expiresAt = parsed
  }

  const { id: shareId, token } = await createShare(user.id, id, {
    permission,
    ...(password !== undefined ? { password } : {}),
    expiresAt,
  })

  return NextResponse.json({ id: shareId, token, url: shareUrl(token) }, { status: 201 })
}
