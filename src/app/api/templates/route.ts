import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import {
  createTemplate,
  createTemplateFromDoc,
  isProseMirrorDoc,
  listTemplates,
} from '@/lib/docs/templates-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const templates = await listTemplates(user.id)
  return NextResponse.json(
    templates.map((t) => ({ id: t.id, name: t.name, description: t.description })),
  )
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

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
    // A directly-supplied template body must be valid ProseMirror `doc` JSON:
    // `{}` / missing content would be persisted and then throw in the editor's
    // seed path (prosemirrorJSONToYDoc → Node.fromJSON) when instantiated.
    if (!isProseMirrorDoc(body.content)) {
      return NextResponse.json({ error: 'content must be a ProseMirror doc' }, { status: 400 })
    }
    const result = await createTemplate(user.id, {
      name,
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      content: body.content,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'empty name') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (err instanceof Error && err.message === 'invalid content') {
      return NextResponse.json({ error: 'content must be a ProseMirror doc' }, { status: 400 })
    }
    if (err instanceof Error && err.message === 'not found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    throw err
  }
}
