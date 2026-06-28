import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { notifyMentions } from '@/lib/docs/comment-notify'
import { addReply, createThread, listComments, parseMentions } from '@/lib/docs/comments-repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  // view access: owner, admin, or any doc-permission grant (viewer+) may read.
  const doc = await resolveDocAccess(user, id, 'view')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const rows = await listComments(id)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user
  const { id } = await ctx.params
  // comment access: a 'commenter' grant (or editor/owner/admin) may post; a bare
  // 'viewer' grant cannot — view ≠ comment.
  const doc = await resolveDocAccess(user, id, 'comment')
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json()) as {
    body?: string
    threadId?: string
    anchorFrom?: number
    anchorTo?: number
    anchorStart?: Record<string, unknown>
    anchorEnd?: Record<string, unknown>
    mentions?: string[]
  }

  if (!body.body || typeof body.body !== 'string' || body.body.trim().length === 0)
    return NextResponse.json({ error: 'body required' }, { status: 400 })

  const mentions = body.mentions ?? parseMentions(body.body)

  if (body.threadId) {
    // Reply to existing thread
    const result = await addReply(id, body.threadId, user.id, {
      body: body.body,
      mentions,
    })
    // H1/H Task 11: @mention → notification (best-effort, non-blocking).
    notifyMentions(id, user.id, body.body, mentions)
    return NextResponse.json(result, { status: 201 })
  }

  // New thread — persist BOTH the durable JSON anchor and the integer fallback.
  const result = await createThread(id, user.id, {
    body: body.body,
    ...(body.anchorFrom !== undefined ? { anchorFrom: body.anchorFrom } : {}),
    ...(body.anchorTo !== undefined ? { anchorTo: body.anchorTo } : {}),
    ...(body.anchorStart !== undefined ? { anchorStart: body.anchorStart } : {}),
    ...(body.anchorEnd !== undefined ? { anchorEnd: body.anchorEnd } : {}),
    mentions,
  })
  notifyMentions(id, user.id, body.body, mentions)
  return NextResponse.json(result, { status: 201 })
}
