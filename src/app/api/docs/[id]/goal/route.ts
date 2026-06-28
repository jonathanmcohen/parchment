import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { setDocumentWritingGoal } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

/**
 * J10-2: PUT /api/docs/[id]/goal { targetWords: number } → { ok: true }
 *
 * Persists the per-doc writing goal into documents.meta.writingGoal. A
 * targetWords <= 0 clears the goal. Owner-scoped — only the document owner may
 * update; mutating, so a docs:read PAT gets 403 (guard) and a foreign/missing doc
 * gets 404 (repo returns false).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:write' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await params
  const body = (await req.json()) as { targetWords?: unknown }
  const raw = body.targetWords
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return NextResponse.json({ error: 'targetWords must be a number' }, { status: 400 })
  }

  const updated = await setDocumentWritingGoal(user.id, id, raw)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
