import { type NextRequest, NextResponse } from 'next/server'
import { listComments } from '@/lib/docs/comments-repo'
import { getDocument } from '@/lib/docs/repo'
import { resolveShare, verifySharePassword } from '@/lib/docs/shares-repo'
import { parseCustomCss } from '@/lib/editor/custom-css'

export const dynamic = 'force-dynamic'

// POST /api/share/[token] — the PUBLIC, UNAUTHENTICATED data path for the share
// viewer. Body: { password? }.
//
// SECURITY: this returns ONLY the doc content for a VALID token + correct
// password — nothing else. It never exposes the owner id, the password hash, or
// any other-doc data. The gate is strictly server-side:
//   • resolveShare(token) → null on a missing OR expired share → 404 (a doc must
//     NEVER render without a valid, non-expired token).
//   • verifySharePassword → 401 when a password is required and missing/wrong.
//   • only after both pass do we load and return the doc's safe public shape.
// No session is required or read; this route lives outside the auth-gated (app)
// group and is reachable by anyone with the link.
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  const share = await resolveShare(token)
  // Missing or expired → 404. Do not distinguish the two (no oracle).
  if (!share) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  const password = typeof body.password === 'string' ? body.password : null

  // Password enforced server-side. A protected share with no/empty password →
  // signal the viewer to prompt; a wrong password → distinct 401 code.
  if (share.passwordHash !== null) {
    if (password === null || password.length === 0)
      return NextResponse.json({ error: 'password_required' }, { status: 401 })
    const ok = await verifySharePassword(share, password)
    if (!ok) return NextResponse.json({ error: 'password_wrong' }, { status: 401 })
  }

  const doc = await getDocument(share.docId)
  // Defensive: the FK cascades on doc HARD-delete, so a resolved share implies the
  // doc row exists; treat a missing doc as an invalid link rather than leaking.
  //
  // SECURITY: a SOFT-deleted (trashed) doc must also be treated as gone. Trashing
  // is the owner's natural "take it down" gesture, but it only sets trashedAt and
  // does not fire the FK cascade — so the share row (and this anonymous path) would
  // otherwise keep serving the full title + content. getDocument has no trashedAt
  // filter, so we gate here. Return the SAME 404 as a missing/expired link so this
  // path never becomes an existence oracle. (trashDocument also deletes the doc's
  // shares for defense-in-depth, so a resolved-but-trashed share is the rare race.)
  if (!doc || doc.trashedAt !== null)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // G17: include owner's custom CSS (raw-but-parsed) — sanitize+scope at render.
  // The viewer's browser never receives un-sanitized CSS; prepareCustomCss runs
  // inside CustomCssStyle on the client. We parse here to normalize/cap the value.
  const docMeta = doc.meta as Record<string, unknown> | null
  const customCss = parseCustomCss(docMeta?.customCss)

  // H2 publish-to-web: include a READ-ONLY comments list (open threads only by
  // default). SAFE shape — display data only, NEVER authorId, email, or mentions
  // (which could carry usernames). An anonymous viewer sees the comment bodies +
  // positions but never who authored them. Root threads only (replies share the
  // root's anchor; the public viewer renders the thread head). Best-effort: a
  // comments-table read failure must not break the read-only doc render.
  let comments: Array<{
    id: string
    threadId: string
    body: string
    resolved: boolean
    createdAt: string
    anchorFrom: number | null
    anchorTo: number | null
  }> = []
  try {
    const all = await listComments(doc.id)
    comments = all
      .filter((c) => c.threadId === c.id && !c.resolved)
      .map((c) => ({
        id: c.id,
        threadId: c.threadId,
        body: c.body,
        resolved: c.resolved,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
        // Integer fallback positions only — the public page has no Y.Doc to resolve
        // the durable JSON anchor against (documented limitation: minor drift on a
        // stale published snapshot). NEVER expose anchorStart/anchorEnd internals.
        anchorFrom: c.anchorFrom,
        anchorTo: c.anchorTo,
      }))
  } catch {
    comments = []
  }

  // Return ONLY the public viewer shape — no ownerId, no passwordHash, no
  // disk/sync/embedding internals.
  return NextResponse.json({
    docId: doc.id,
    title: doc.title,
    contentJson: doc.content,
    permission: share.permission,
    customCss,
    comments,
  })
}
