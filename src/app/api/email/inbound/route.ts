import { type NextRequest, NextResponse } from 'next/server'
import { timingSafeEqualStr } from '@/lib/auth/mfa'
import { createThread } from '@/lib/docs/comments-repo'
import { getDocument } from '@/lib/docs/repo'
import {
  formatInboundComment,
  isEmailInEnabled,
  parseInboundAddress,
} from '@/lib/integrations/email-in'

// J5 — inbound email relay → comment. This is the ONLY way external content
// enters Parchment as a comment, so it is defended on two independent axes:
//   1. SHARED SECRET — the request must carry `X-Inbound-Secret` equal to
//      INBOUND_EMAIL_SECRET, compared CONSTANT-TIME. A wrong/absent secret → 401.
//   2. ADDRESS SIG — the `to` address must carry a valid HMAC sig for its docId
//      (parseInboundAddress verifies it constant-time). A forged/guessed address
//      → no docId → 400. So an attacker who somehow learned the secret still
//      can't post to a doc whose address they can't forge, and vice-versa.
//
// OFF BY DEFAULT — when email-in is unconfigured the route 404s and does not
// reveal that the endpoint exists (no "disabled" body, just a not-found).
//
// The operator's mail service / MTA (SendGrid/Mailgun inbound-parse, a Postfix
// pipe script, etc.) POSTs a parsed-email JSON `{ to, from, subject, text }`.
// Parchment does NOT run an SMTP server. runtime='nodejs' because the comment
// formatter + secret compare use node:crypto.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reject oversized inbound bodies before buffering (a parsed email is small; a
// multi-MB payload is abuse). 256 KB is generous for headers + a text body.
const MAX_BYTES = 256 * 1024

interface InboundBody {
  to?: unknown
  from?: unknown
  subject?: unknown
  text?: unknown
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

export async function POST(req: NextRequest) {
  // Off-by-default: do not reveal the endpoint when email-in is unconfigured.
  if (!isEmailInEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Shared-secret gate (constant-time). The secret is read here (server-only)
  // and never echoed. A missing header compares against '' and fails.
  const secret = process.env.INBOUND_EMAIL_SECRET ?? ''
  const provided = req.headers.get('x-inbound-secret') ?? ''
  if (!timingSafeEqualStr(provided, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Oversized-body guard (Content-Length first, then the parsed size).
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 })
  }

  let body: InboundBody
  try {
    const raw = await req.text()
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: 'payload too large' }, { status: 413 })
    }
    body = JSON.parse(raw) as InboundBody
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const to = asStringOrNull(body.to)
  if (to === null) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  // Address-sig gate. A forged/guessed `to` yields no docId → 400 (no comment).
  const parsed = parseInboundAddress(to)
  if (parsed === null) {
    return NextResponse.json({ error: 'unrecognized recipient' }, { status: 400 })
  }

  // The doc must still exist. If it was deleted, drop the mail quietly (200 so
  // the MTA does not retry a now-meaningless delivery).
  const doc = await getDocument(parsed.docId)
  if (!doc) {
    return NextResponse.json({ created: false, reason: 'doc_gone' }, { status: 200 })
  }

  // One inbound email → one new top-level comment thread, authored by no
  // Parchment user (authorId null); the sender lives in the sanitized body.
  const commentBody = formatInboundComment({
    from: asStringOrNull(body.from),
    subject: asStringOrNull(body.subject),
    text: asStringOrNull(body.text),
  })

  try {
    await createThread(parsed.docId, null, { body: commentBody })
  } catch {
    // Resilient: a transient DB error should let the MTA retry (502), not crash.
    return NextResponse.json({ error: 'temporary failure' }, { status: 502 })
  }

  return NextResponse.json({ created: true }, { status: 200 })
}
