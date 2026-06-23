// J5 — email-in: per-doc inbound address (a STATELESS, UNFORGEABLE HMAC) +
// inbound-email → comment formatting. PURE + env-reading; framework-free and
// (apart from process.env) side-effect-free, so it is unit-testable in node
// without a DB, network, or the 'server-only' guard. It uses only `node:crypto`
// (createHmac + timingSafeEqual — the same idiom as src/lib/auth/mfa.ts and
// src/lib/integrations/webhooks.ts), which is pure JS, safe in a server bundle,
// and must NEVER be pulled into a client bundle. It imports no `@/db`.
//
// THE CRUX — the address needs NO DB table. Each document's inbound address is
//   doc.<docId>.<sig>@<INBOUND_EMAIL_DOMAIN>
// where sig = a truncated base32 of HMAC-SHA256(INBOUND_EMAIL_SECRET, docId).
// The sig makes the address unguessable AND unforgeable: only this server (which
// holds the secret) can produce a valid sig for a given docId, so an attacker
// cannot post a comment to an arbitrary doc by guessing its address. parsing
// recomputes the expected sig and compares CONSTANT-TIME — a wrong sig yields
// null (no docId), so the inbound endpoint drops it.
//
// OFF BY DEFAULT — works only when BOTH INBOUND_EMAIL_DOMAIN and
// INBOUND_EMAIL_SECRET are set (the isSemanticEnabled idiom). Unset → no address
// is produced and parsing always returns null, so the feature is dark.
//
// SECURITY: INBOUND_EMAIL_SECRET is the HMAC key — server-only, NEVER returned to
// a client and NEVER logged. The address sig is a truncated HMAC and reveals
// nothing about the secret.

import { createHmac, timingSafeEqual } from 'node:crypto'

// The fixed local-part prefix every inbound address carries.
const ADDRESS_PREFIX = 'doc'

// Crockford-style base32 alphabet (lowercase, no padding) — matches the recovery
// codes in mfa.ts. The sig is rendered with this and is case-insensitive on the
// way back in (mail systems may lowercase the local part).
const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

// Truncate the HMAC to this many base32 chars. 26 chars × 5 bits = 130 bits of
// the 256-bit HMAC — astronomically unguessable while keeping the address short.
const SIG_LENGTH = 26

// A docId must be a canonical UUID (the documents.id shape). Validating this in
// both directions keeps a malformed/oversized local part from ever reaching the
// DB lookup, and keeps the address space exactly the UUID space.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// formatInboundComment hard caps. The comment body is plain text rendered safely
// elsewhere, but we still cap length (a 100 KB email must not become a 100 KB
// comment) and strip control chars / markup defensively.
const MAX_COMMENT_BODY = 10_000
const MAX_HEADER_FIELD = 200

/** The configured inbound domain, or null when email-in is unconfigured. */
function inboundDomain(): string | null {
  const d = process.env.INBOUND_EMAIL_DOMAIN
  return d && d.length > 0 ? d.toLowerCase() : null
}

/** The configured inbound HMAC secret, or null when email-in is unconfigured.
 *  Server-only — never returned to a client, never logged. */
function inboundSecret(): string | null {
  const s = process.env.INBOUND_EMAIL_SECRET
  return s && s.length > 0 ? s : null
}

/**
 * Email-in is enabled only when BOTH the inbound domain AND the inbound secret
 * are configured (the isSemanticEnabled off-by-default idiom). Either missing →
 * no per-doc address is produced, parsing always fails, and the endpoint 404s.
 */
export function isEmailInEnabled(): boolean {
  return inboundDomain() !== null && inboundSecret() !== null
}

/** Crockford-style base32 of a buffer, lowercase, no padding. Pure bit-packing. */
function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return out
}

/** The truncated base32 sig for a docId, or null when unconfigured. Internal —
 *  the secret never leaves this module. */
function signDocId(docId: string): string | null {
  const secret = inboundSecret()
  if (secret === null) return null
  const digest = createHmac('sha256', secret).update(docId).digest()
  return base32Encode(digest).slice(0, SIG_LENGTH)
}

/**
 * The unique inbound email address for a document, or null when email-in is
 * unconfigured (or the docId isn't a valid UUID). Deterministic: the same docId
 * always yields the same address. Format: `doc.<docId>.<sig>@<domain>`.
 */
export function docInboundAddress(docId: string): string | null {
  const domain = inboundDomain()
  if (domain === null) return null
  if (!UUID_RE.test(docId)) return null
  const sig = signDocId(docId)
  if (sig === null) return null
  return `${ADDRESS_PREFIX}.${docId.toLowerCase()}.${sig}@${domain}`
}

/** Length-safe, constant-time string compare (the mfa.ts timingSafeEqualStr
 *  idiom). Returns false on length mismatch without leaking via early exit. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Parse an inbound `To:` address back to its docId, verifying the HMAC sig
 * CONSTANT-TIME. Returns `{ docId }` ONLY when:
 *   - email-in is configured,
 *   - the host exactly matches INBOUND_EMAIL_DOMAIN,
 *   - the local part is exactly `doc.<docId>.<sig>` with a valid UUID docId, and
 *   - the recomputed sig matches the supplied sig (constant-time).
 * Any malformed local part, wrong domain, bad docId shape, forged/tampered sig,
 * or a sig grafted onto a different docId → null. This is the security gate that
 * stops an attacker from posting a comment to an arbitrary doc.
 */
export function parseInboundAddress(toAddress: string): { docId: string } | null {
  const domain = inboundDomain()
  if (domain === null) return null
  if (typeof toAddress !== 'string' || toAddress.length === 0) return null

  // Split exactly once on the LAST '@' (local parts here never contain '@').
  const at = toAddress.lastIndexOf('@')
  if (at <= 0) return null
  const local = toAddress.slice(0, at)
  const host = toAddress.slice(at + 1).toLowerCase()

  // Wrong domain → reject (a valid sig for our doc means nothing on someone
  // else's domain). Constant-time not required here: the domain is not secret.
  if (host !== domain) return null

  const parts = local.split('.')
  if (parts.length !== 3) return null
  const [prefix, docIdRaw, sig] = parts
  if (prefix !== ADDRESS_PREFIX) return null
  if (sig === undefined || sig.length === 0) return null

  const docId = (docIdRaw ?? '').toLowerCase()
  if (!UUID_RE.test(docId)) return null

  const expected = signDocId(docId)
  if (expected === null) return null

  // CONSTANT-TIME compare. A forged sig (any tamper) or a sig minted for another
  // docId fails here — the expected sig is recomputed FROM this address's docId,
  // so a swapped-docId-reused-sig never matches.
  if (!constantTimeEqual(sig.toLowerCase(), expected)) return null

  return { docId }
}

/** Collapse a single-line HEADER field (From/Subject) to safe plain text: strip
 *  HTML tags, drop C0/C1 control chars, then collapse ALL whitespace — crucially
 *  including newlines/CRs/tabs — to a single space so the value can never span
 *  more than one line. This is the integrity gate for the `From:`/`Subject:`
 *  provenance lines: a header field with an embedded newline is NOT a header
 *  line, and must not be able to inject a forged `From:`/`Subject:` line into the
 *  comment body. Trim and cap to `max` chars AFTER collapsing. */
function sanitizeField(value: string, max: number): string {
  return collapseWhitespace(stripControl(stripHtml(value)))
    .trim()
    .slice(0, max)
}

/** Collapse every run of whitespace (spaces, tabs, newlines, carriage returns,
 *  and other Unicode whitespace) to a single ASCII space. Used only for the
 *  single-line header fields, so an embedded newline cannot forge an extra
 *  `From:`/`Subject:` provenance line in the comment body. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ')
}

/** Remove anything that looks like an HTML/XML tag, so no markup can be injected
 *  into the comment. The comment body is rendered as plain text downstream; this
 *  is belt-and-suspenders against a markup-aware renderer. A "tag" is `<`, an
 *  optional `/`, then an ASCII letter (an element name), then anything up to `>`
 *  — so real markup (`<script>`, `</b>`, `<a href="x">`) is stripped while an
 *  email address in angle brackets (`<alice@example.com>`, which starts with a
 *  letter but contains `@`/`.` before any `>`) is left intact for the From line. */
function stripHtml(value: string): string {
  return value.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^<>]*)?>/g, '')
}

/** Strip C0 control chars (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) and DEL/C1
 *  (0x7F–0x9F); keep tab (0x09) and newline (0x0A). Carriage returns are
 *  normalized to newlines first so CRLF email bodies collapse cleanly. */
function stripControl(value: string): string {
  return (
    value
      .replace(/\r\n?/g, '\n')
      // Strip C0 controls except tab (0x09) and newline (0x0A); plus DEL/C1 (0x7F-0x9F).
      // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately stripping control chars from untrusted email
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
  )
}

/**
 * Build the comment-body string for one inbound email. The result is sanitized
 * PLAIN TEXT — HTML stripped, control chars removed, each field length-capped,
 * and the whole thing capped to MAX_COMMENT_BODY. It records the sender and
 * subject as leading `From:` / `Subject:` header lines (the doc has no Parchment
 * user for an inbound email, so authorId is null and the sender lives in the
 * body), followed by the message text. No markup is ever injected.
 */
export function formatInboundComment(input: {
  from?: string | null | undefined
  subject?: string | null | undefined
  text?: string | null | undefined
}): string {
  const from = sanitizeField(String(input.from ?? ''), MAX_HEADER_FIELD)
  const subject = sanitizeField(String(input.subject ?? ''), MAX_HEADER_FIELD)
  const text = stripControl(stripHtml(String(input.text ?? ''))).trim()

  const lines: string[] = []
  if (from.length > 0) lines.push(`From: ${from}`)
  if (subject.length > 0) lines.push(`Subject: ${subject}`)
  // Blank line between headers and the body when there are headers.
  if (lines.length > 0 && text.length > 0) lines.push('')
  if (text.length > 0) lines.push(text)

  return lines.join('\n').slice(0, MAX_COMMENT_BODY)
}
