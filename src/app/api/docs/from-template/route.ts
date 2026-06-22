import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getBuiltinTemplate } from '@/lib/docs/builtin-templates'
import { createDocument } from '@/lib/docs/repo'
import { getTemplateContent, listTemplates } from '@/lib/docs/templates-repo'

export const dynamic = 'force-dynamic'

// G2: instantiate a NEW document from a template (bundled via builtinKey, or a
// user template via templateId — owner-scoped). Returns the new doc's id.
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { builtinKey?: unknown; templateId?: unknown }

  let content: unknown
  let title: string | undefined

  if (typeof body.builtinKey === 'string') {
    const builtin = getBuiltinTemplate(body.builtinKey)
    if (builtin) {
      content = builtin.content
      title = builtin.name
    }
  } else if (typeof body.templateId === 'string') {
    const resolved = await getTemplateContent(user.id, body.templateId)
    if (resolved !== null) {
      content = resolved
      // Use the saved template's name as the new doc's title.
      const mine = await listTemplates(user.id)
      title = mine.find((t) => t.id === body.templateId)?.name
    }
  }

  if (content === undefined) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const { id } = await createDocument(user.id, {
    content,
    ...(title ? { title } : {}),
  })
  return NextResponse.json({ id }, { status: 201 })
}
