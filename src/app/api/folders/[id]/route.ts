import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { deleteFolder, moveFolder, renameFolder } from '@/lib/docs/folders-repo'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const body = (await req.json()) as { name?: unknown; parentId?: unknown }

  if (typeof body.name === 'string') {
    await renameFolder(id, body.name)
  }

  if ('parentId' in body) {
    const newParentId =
      body.parentId === null ? null : typeof body.parentId === 'string' ? body.parentId : null
    try {
      await moveFolder(user.id, id, newParentId)
    } catch (err) {
      if (err instanceof Error && err.message === 'cycle') {
        return NextResponse.json({ error: 'cycle' }, { status: 409 })
      }
      throw err
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteFolder(user.id, id)
  return NextResponse.json({ ok: true })
}
