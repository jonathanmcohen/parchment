import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { getAppConfig } from '@/lib/config/repo'
import { SECRET_MASK } from '@/lib/crypto/secret-box'

const TLS_VALUES = ['none', 'tls', 'starttls'] as const
type TlsValue = (typeof TLS_VALUES)[number]

/**
 * POST /api/settings/smtp/test
 * Builds a one-shot transporter from the submitted fields (does NOT save to DB).
 * Admin-only. Validates before sending. Never logs the password.
 *
 * Body: { host, port, user?, password?, from, tls, to? }
 *   password === SECRET_MASK → reads stored password from DB
 * Returns: { ok: true } | { ok: false, error: string }
 */
export async function POST(req: NextRequest | Request): Promise<NextResponse> {
  // Auth gate — admin only
  const user = await authenticateRequest(req as NextRequest)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  // Validate required fields
  const { host, port, user: smtpUser, password, from, tls, to } = body

  if (!host || typeof host !== 'string' || host.trim() === '') {
    return NextResponse.json({ error: 'host is required' }, { status: 400 })
  }
  if (port === undefined || port === null) {
    return NextResponse.json({ error: 'port is required' }, { status: 400 })
  }
  const portNum = Number(port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return NextResponse.json({ error: 'port must be between 1 and 65535' }, { status: 400 })
  }
  if (!from || typeof from !== 'string' || !from.includes('@')) {
    return NextResponse.json({ error: 'from is required and must contain @' }, { status: 400 })
  }
  if (!tls || !TLS_VALUES.includes(tls as TlsValue)) {
    return NextResponse.json({ error: `tls must be one of: ${TLS_VALUES.join(', ')}` }, { status: 400 })
  }

  // Resolve password — if the client sent the mask, read the stored one
  let resolvedPassword: string | null = null
  if (typeof password === 'string' && password === SECRET_MASK) {
    resolvedPassword = await getAppConfig('smtp_password')
  } else if (typeof password === 'string' && password !== '') {
    resolvedPassword = password
  }

  // Build a one-shot transporter (does NOT save to DB)
  const nodemailer = await import('nodemailer')

  const tlsOpts =
    tls === 'tls'
      ? { secure: true }
      : tls === 'starttls'
        ? { secure: false, requireTLS: true }
        : { secure: false, ignoreTLS: true }

  const auth =
    smtpUser && resolvedPassword
      ? { user: String(smtpUser), pass: resolvedPassword }
      : undefined

  const transporter = nodemailer.createTransport({
    host: String(host),
    port: portNum,
    ...tlsOpts,
    ...(auth ? { auth } : {}),
  })

  // Destination: body.to or the authenticated user's email
  const destination = typeof to === 'string' && to.includes('@') ? to : user.email

  try {
    await transporter.sendMail({
      from: String(from),
      to: destination,
      subject: 'Parchment SMTP test',
      text: 'This is a test email from Parchment to verify your SMTP configuration is working correctly.',
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    // Log only the error message — NOT the full error object (which may contain
    // auth credentials in some SMTP libraries) and NOT the password variable.
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[smtp-test] send failed: ${msg}`)
    return NextResponse.json({ ok: false, error: msg })
  }
}
