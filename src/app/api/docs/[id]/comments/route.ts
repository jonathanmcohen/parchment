import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { addReply, createThread, listComments, parseMentions } from '@/lib/docs/comments-repo'
import { getDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const rows = await listComments(id)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json()) as {
    body?: string
    threadId?: string
    anchorFrom?: number
    anchorTo?: number
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
    return NextResponse.json(result, { status: 201 })
  }

  // New thread
  const result = await createThread(id, user.id, {
    body: body.body,
    ...(body.anchorFrom !== undefined ? { anchorFrom: body.anchorFrom } : {}),
    ...(body.anchorTo !== undefined ? { anchorTo: body.anchorTo } : {}),
    mentions,
  })
  return NextResponse.json(result, { status: 201 })
}
