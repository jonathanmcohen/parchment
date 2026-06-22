import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { createTemplate, createTemplateFromDoc, listTemplates } from '@/lib/docs/templates-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const templates = await listTemplates(user.id)
  return NextResponse.json(
    templates.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  )
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    name?: unknown
    fromDocId?: unknown
    description?: unknown
    content?: unknown
  }
  const name = typeof body.name === 'string' ? body.name : ''
  if (name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  try {
    if (typeof body.fromDocId === 'string') {
      // Capture an existing doc's content as a template (owner-scoped).
      const result = await createTemplateFromDoc(user.id, body.fromDocId, name)
      return NextResponse.json(result, { status: 201 })
    }
    const result = await createTemplate(user.id, {
      name,
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      content: body.content ?? {},
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'empty name') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (err instanceof Error && err.message === 'not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    throw err
  }
}
