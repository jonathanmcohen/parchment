import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { parseCriteria } from '@/lib/docs/smart-folder-criteria'
import {
  deleteSmartFolder,
  renameSmartFolder,
  updateSmartFolderCriteria,
} from '@/lib/docs/smart-folders-repo'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { name?: unknown; criteria?: unknown }

  if (typeof body.name === 'string') {
    await renameSmartFolder(user.id, id, body.name)
  }

  if ('criteria' in body) {
    const criteria = parseCriteria(body.criteria)
    await updateSmartFolderCriteria(user.id, id, criteria)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  await deleteSmartFolder(user.id, id)
  return NextResponse.json({ ok: true })
}
