import { type NextRequest, NextResponse } from 'next/server'
import { getDocAccess } from '@/lib/authz/doc-access'
import { notifyMentions } from '@/lib/docs/comment-notify'
import { addReply, createThread, listComments, parseMentions } from '@/lib/docs/comments-repo'
import { resolveShareGrant } from '@/lib/docs/share-grant'
import { resolveShare } from '@/lib/docs/shares-repo'

export const dynamic = 'force-dynamic'

// H Task 9 — the PUBLIC, share-scoped comment route. The capability is bound to the
// share TOKEN in the URL (not a session): a `view` link can READ the thread list
// but CANNOT create; a `comment`/`edit` link can do both. Expiry + password are
// enforced server-side, every request (resolveShareGrant drops expired/wrong-pw →
// 404). No session is read; reachable by anyone with the link.
//
// SECURITY: every gate runs server-side via A's getDocAccess({ shareGrant }) — the
// client UI gating is cosmetic and assumed bypassed. The created comment row carries
// authorId: null (anonymous-via-link) and the doc id from the TOKEN's share (never a
// client-supplied doc id — no cross-doc write).

type RouteCtx = { params: Promise<{ token: string }> }

// Resolve the token to { grant, docId } or null. Password (when set on the share)
// is read from the request body `{ password? }` exactly like /api/share/[token].
async function resolve(
  token: string,
  password: string | null,
): Promise<{ docId: string; grant: { role: 'viewer' | 'commenter' | 'editor' } } | null> {
  const grant = await resolveShareGrant(token, password)
  if (!grant) return null
  // resolveShareGrant already proved the share is valid+non-expired+pw-ok; fetch the
  // row again only to read its docId (resolveShare re-drops expired defensively).
  const share = await resolveShare(token)
  if (!share) return null
  return { docId: share.docId, grant }
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params
  // GET has no body → no password; a password-protected share's list stays gated
  // behind the POST /api/share/[token] password flow (the viewer fetches content
  // there first). For a non-protected view/comment link this returns the list.
  const resolved = await resolve(token, null)
  if (!resolved) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const access = await getDocAccess({ shareGrant: resolved.grant }, resolved.docId)
  if (!access.canView) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const rows = await listComments(resolved.docId)
  // Safe shape: never leak authorId/email to an anonymous viewer.
  const safe = rows.map((r) => ({
    id: r.id,
    threadId: r.threadId,
    body: r.body,
    resolved: r.resolved,
    createdAt: r.createdAt,
    anchorFrom: r.anchorFrom,
    anchorTo: r.anchorTo,
    anchorStart: r.anchorStart,
    anchorEnd: r.anchorEnd,
  }))
  return NextResponse.json(safe)
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as {
    body?: string
    threadId?: string
    password?: string
    anchorFrom?: number
    anchorTo?: number
    anchorStart?: Record<string, unknown>
    anchorEnd?: Record<string, unknown>
    mentions?: string[]
  }
  const password = typeof body.password === 'string' ? body.password : null

  const resolved = await resolve(token, password)
  if (!resolved) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const access = await getDocAccess({ shareGrant: resolved.grant }, resolved.docId)
  // A `view` link can read but NOT comment — gate POST on canComment.
  if (!access.canComment) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  if (!body.body || typeof body.body !== 'string' || body.body.trim().length === 0)
    return NextResponse.json({ error: 'body required' }, { status: 400 })

  const mentions = body.mentions ?? parseMentions(body.body)

  if (body.threadId) {
    const result = await addReply(resolved.docId, body.threadId, null, {
      body: body.body,
      mentions,
    })
    // Anonymous link author → notify mentioned users (best-effort, non-blocking).
    notifyMentions(resolved.docId, null, body.body, mentions)
    return NextResponse.json(result, { status: 201 })
  }

  const result = await createThread(resolved.docId, null, {
    body: body.body,
    ...(body.anchorFrom !== undefined ? { anchorFrom: body.anchorFrom } : {}),
    ...(body.anchorTo !== undefined ? { anchorTo: body.anchorTo } : {}),
    ...(body.anchorStart !== undefined ? { anchorStart: body.anchorStart } : {}),
    ...(body.anchorEnd !== undefined ? { anchorEnd: body.anchorEnd } : {}),
    mentions,
  })
  notifyMentions(resolved.docId, null, body.body, mentions)
  return NextResponse.json(result, { status: 201 })
}
