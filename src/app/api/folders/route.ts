import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { createFolder, listFolders } from '@/lib/docs/folders-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const folders = await listFolders(user.id)
  return NextResponse.json(folders)
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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
