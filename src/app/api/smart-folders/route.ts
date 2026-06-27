import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { parseCriteria } from '@/lib/docs/smart-folder-criteria'
import { createSmartFolder, listSmartFolders } from '@/lib/docs/smart-folders-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const folders = await listSmartFolders(user.id)
  return NextResponse.json(
    folders.map((sf) => ({ id: sf.id, name: sf.name, criteria: sf.criteria })),
  )
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { name?: unknown; criteria?: unknown }
  const name = typeof body.name === 'string' ? body.name : ''
  const criteria = parseCriteria(body.criteria ?? {})

  try {
    const result = await createSmartFolder(user.id, { name, criteria })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'empty name') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    throw err
  }
}
