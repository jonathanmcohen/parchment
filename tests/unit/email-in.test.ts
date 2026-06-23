import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// J5 — email-in pure logic. The stateless HMAC per-doc address, its parser
// (constant-time, sig-verified), and the comment-body formatter (sanitizer).
//
// The module reads INBOUND_EMAIL_DOMAIN / INBOUND_EMAIL_SECRET at call time, so
// each test stubs process.env then re-imports via vi.resetModules() (the
// embeddings.test.ts idiom). A real UUID stands in for a docId throughout.

const DOMAIN = 'inbound.example.com'
const SECRET = 'super-secret-inbound-key-0123456789'
const DOC_ID = '11111111-2222-4333-8444-555555555555'
const OTHER_DOC_ID = '99999999-8888-4777-8666-555555555555'

/** Split `doc.<id>.<sig>@<host>` into its parts, asserting the shape. */
function parts(addr: string): { local: string; host: string; sig: string } {
  const at = addr.lastIndexOf('@')
  const local = addr.slice(0, at)
  const host = addr.slice(at + 1)
  const sig = local.split('.').at(-1) as string
  return { local, host, sig }
}

describe('email-in pure logic', () => {
  let origDomain: string | undefined
  let origSecret: string | undefined

  beforeEach(() => {
    origDomain = process.env.INBOUND_EMAIL_DOMAIN
    origSecret = process.env.INBOUND_EMAIL_SECRET
    vi.resetModules()
  })

  afterEach(() => {
    if (origDomain === undefined) delete process.env.INBOUND_EMAIL_DOMAIN
    else process.env.INBOUND_EMAIL_DOMAIN = origDomain
    if (origSecret === undefined) delete process.env.INBOUND_EMAIL_SECRET
    else process.env.INBOUND_EMAIL_SECRET = origSecret
  })

  function enable() {
    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN
    process.env.INBOUND_EMAIL_SECRET = SECRET
  }

  function disable() {
    delete process.env.INBOUND_EMAIL_DOMAIN
    delete process.env.INBOUND_EMAIL_SECRET
  }

  // ── isEmailInEnabled ──────────────────────────────────────────────────────

  it('isEmailInEnabled is false unless BOTH env vars are set', async () => {
    disable()
    let mod = await import('@/lib/integrations/email-in')
    expect(mod.isEmailInEnabled()).toBe(false)

    process.env.INBOUND_EMAIL_DOMAIN = DOMAIN
    delete process.env.INBOUND_EMAIL_SECRET
    vi.resetModules()
    mod = await import('@/lib/integrations/email-in')
    expect(mod.isEmailInEnabled()).toBe(false)

    delete process.env.INBOUND_EMAIL_DOMAIN
    process.env.INBOUND_EMAIL_SECRET = SECRET
    vi.resetModules()
    mod = await import('@/lib/integrations/email-in')
    expect(mod.isEmailInEnabled()).toBe(false)

    enable()
    vi.resetModules()
    mod = await import('@/lib/integrations/email-in')
    expect(mod.isEmailInEnabled()).toBe(true)
  })

  // ── docInboundAddress ─────────────────────────────────────────────────────

  it('docInboundAddress returns null when email-in is unconfigured', async () => {
    disable()
    const { docInboundAddress } = await import('@/lib/integrations/email-in')
    expect(docInboundAddress(DOC_ID)).toBeNull()
  })

  it('docInboundAddress returns a stable address when configured', async () => {
    enable()
    const { docInboundAddress } = await import('@/lib/integrations/email-in')
    const a = docInboundAddress(DOC_ID)
    const b = docInboundAddress(DOC_ID)
    expect(a).not.toBeNull()
    expect(a).toBe(b) // deterministic
    expect(a).toContain(`@${DOMAIN}`)
    expect(a).toContain(`doc.${DOC_ID}.`)
    // Different docs → different addresses (the sig differs).
    expect(docInboundAddress(OTHER_DOC_ID)).not.toBe(a)
  })

  it('docInboundAddress returns null for a malformed docId', async () => {
    enable()
    const { docInboundAddress } = await import('@/lib/integrations/email-in')
    expect(docInboundAddress('not-a-uuid')).toBeNull()
    expect(docInboundAddress('')).toBeNull()
  })

  // ── parseInboundAddress (round-trip) ──────────────────────────────────────

  it('parseInboundAddress round-trips a generated address back to its docId', async () => {
    enable()
    const { docInboundAddress, parseInboundAddress } = await import('@/lib/integrations/email-in')
    const addr = docInboundAddress(DOC_ID)
    expect(addr).not.toBeNull()
    const parsed = parseInboundAddress(addr as string)
    expect(parsed).toEqual({ docId: DOC_ID })
  })

  it('parseInboundAddress returns null when unconfigured', async () => {
    disable()
    const { parseInboundAddress } = await import('@/lib/integrations/email-in')
    expect(parseInboundAddress(`doc.${DOC_ID}.abcdef@${DOMAIN}`)).toBeNull()
  })

  // ── parseInboundAddress rejections (the security crux) ─────────────────────

  it('parseInboundAddress REJECTS a forged / tampered sig', async () => {
    enable()
    const { docInboundAddress, parseInboundAddress } = await import('@/lib/integrations/email-in')
    const addr = docInboundAddress(DOC_ID) as string
    // Flip the last char of the sig portion (local part: doc.<id>.<sig>).
    const { local, host } = parts(addr)
    const lastChar = local.slice(-1)
    const flipped = lastChar === 'a' ? 'b' : 'a'
    const forged = `${local.slice(0, -1)}${flipped}@${host}`
    expect(parseInboundAddress(forged)).toBeNull()
  })

  it('parseInboundAddress REJECTS a wrong domain', async () => {
    enable()
    const { docInboundAddress, parseInboundAddress } = await import('@/lib/integrations/email-in')
    const addr = docInboundAddress(DOC_ID) as string
    const { local } = parts(addr)
    expect(parseInboundAddress(`${local}@evil.example.org`)).toBeNull()
  })

  it('parseInboundAddress REJECTS a malformed local part', async () => {
    enable()
    const { parseInboundAddress } = await import('@/lib/integrations/email-in')
    expect(parseInboundAddress(`garbage@${DOMAIN}`)).toBeNull()
    expect(parseInboundAddress(`doc.${DOC_ID}@${DOMAIN}`)).toBeNull() // missing sig
    expect(parseInboundAddress(`doc..sig@${DOMAIN}`)).toBeNull() // empty docId
    expect(parseInboundAddress(`reply.${DOC_ID}.sig@${DOMAIN}`)).toBeNull() // wrong prefix
    expect(parseInboundAddress('')).toBeNull()
    expect(parseInboundAddress('no-at-sign')).toBeNull()
  })

  it('parseInboundAddress REJECTS a swapped docId reusing another docId sig', async () => {
    enable()
    const { docInboundAddress, parseInboundAddress } = await import('@/lib/integrations/email-in')
    // Take DOC_ID's valid sig but graft it onto OTHER_DOC_ID's local part.
    const addr = docInboundAddress(DOC_ID) as string
    const { host, sig } = parts(addr)
    const swapped = `doc.${OTHER_DOC_ID}.${sig}@${host}`
    expect(parseInboundAddress(swapped)).toBeNull()
  })

  // ── formatInboundComment (sanitizer) ──────────────────────────────────────

  it('formatInboundComment strips HTML and keeps From/Subject header lines', async () => {
    const { formatInboundComment } = await import('@/lib/integrations/email-in')
    const out = formatInboundComment({
      from: 'Alice <alice@example.com>',
      subject: 'Hello <b>there</b>',
      text: 'Body with <script>alert(1)</script> tags and <a href="x">link</a>.',
    })
    expect(out).toContain('From: Alice <alice@example.com>')
    expect(out).toContain('Subject: Hello there')
    // No HTML tags survive in the body content.
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<b>')
    expect(out).not.toContain('<a ')
    expect(out).toContain('alert(1)') // text content kept, markup stripped
  })

  it('formatInboundComment caps overall length', async () => {
    const { formatInboundComment } = await import('@/lib/integrations/email-in')
    const huge = 'x'.repeat(100_000)
    const out = formatInboundComment({ from: 'a@b.com', subject: 's', text: huge })
    expect(out.length).toBeLessThanOrEqual(10_000)
  })

  it('formatInboundComment strips control characters and tolerates missing fields', async () => {
    const { formatInboundComment } = await import('@/lib/integrations/email-in')
    // NUL + BEL + ESC interleaved with text; tab/newline are allowed whitespace.
    const NUL = String.fromCharCode(0)
    const BEL = String.fromCharCode(7)
    const ESC = String.fromCharCode(27)
    const ctrl = `${NUL}line1${BEL}line2${ESC}`
    const out = formatInboundComment({ from: 'a@b.com', subject: undefined, text: ctrl })
    // No C0 control chars (0x00–0x08 range) survive in the output.
    const C0 = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(8)}]`)
    expect(out).not.toMatch(C0)
    expect(out).not.toContain(ESC)
    expect(out).toContain('From: a@b.com')
    expect(out).toContain('line1')
    expect(out).toContain('line2')
  })

  // ── constant-time compare (no early-return char compare) ──────────────────

  it('parseInboundAddress rejects a same-length wrong sig AND a length-mismatched sig without throwing', async () => {
    // The constant-time compare is length-guarded then byte-equal: a sig that is
    // the right length but wrong, and a sig of the wrong length entirely, both
    // return null (never throw, never early-return on the first differing char).
    enable()
    const { docInboundAddress, parseInboundAddress } = await import('@/lib/integrations/email-in')
    const addr = docInboundAddress(DOC_ID) as string
    const { host, sig: realSig } = parts(addr)

    // Same length, every char wrong → false (not a length-based shortcut).
    const sameLenWrong = 'z'.repeat(realSig.length)
    expect(() => parseInboundAddress(`doc.${DOC_ID}.${sameLenWrong}@${host}`)).not.toThrow()
    expect(parseInboundAddress(`doc.${DOC_ID}.${sameLenWrong}@${host}`)).toBeNull()

    // Length mismatch (truncated sig) → false, no throw.
    const truncated = realSig.slice(0, 4)
    expect(() => parseInboundAddress(`doc.${DOC_ID}.${truncated}@${host}`)).not.toThrow()
    expect(parseInboundAddress(`doc.${DOC_ID}.${truncated}@${host}`)).toBeNull()
  })

  it('email-in.ts uses node:crypto timingSafeEqual for the sig compare (source check)', async () => {
    // A static assertion that the constant-time primitive is the one in use —
    // the parser must not fall back to a plain `===` (which early-returns on the
    // first differing char and leaks timing).
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const src = await readFile(
      fileURLToPath(new URL('../../src/lib/integrations/email-in.ts', import.meta.url)),
      'utf8',
    )
    expect(src).toContain('timingSafeEqual')
  })
})
