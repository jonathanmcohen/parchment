import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { docInboundAddress } from '@/lib/integrations/email-in'

// J5 — owner-scoped lookup of a document's inbound email address, so the
// comments panel can show "Email to comment: <address>" (copyable) ONLY when
// email-in is configured. Returns `{ address: null }` when unconfigured (the UI
// then shows nothing) and 404 for a doc the caller doesn't own — the address is
// derived from the docId + the server secret, so leaking it to a non-owner would
// hand them a write path into the doc's comments.
//
// NOTE: docInboundAddress never returns or logs INBOUND_EMAIL_SECRET — only the
// truncated-HMAC address — so this endpoint exposes no secret material.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const { id } = await ctx.params
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // null when email-in is unconfigured → the UI shows nothing.
  return NextResponse.json({ address: docInboundAddress(id) })
}
