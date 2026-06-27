import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { createFolder, listFolders } from '@/lib/docs/folders-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const folders = await listFolders(user.id)
  return NextResponse.json(folders)
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const body = (await req.json()) as { name?: unknown; parentId?: unknown }
  const name = typeof body.name === 'string' ? body.name : ''
  const parentId: string | null | undefined =
    body.parentId === null ? null : typeof body.parentId === 'string' ? body.parentId : undefined

  try {
    const opts = parentId === undefined ? { name } : { name, parentId }
    const result = await createFolder(user.id, opts)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'empty name') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    throw err
  }
}
