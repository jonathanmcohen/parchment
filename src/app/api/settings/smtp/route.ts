import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import {
  clearSmtpConfig,
  getSmtpConfig,
  getSmtpPasswordMasked,
  isSmtpConfigured,
  type SmtpConfig,
  saveSmtpConfig,
} from '@/lib/config/smtp-config-repo'
import { SECRET_MASK } from '@/lib/crypto/secret-box'

const TLS_VALUES = ['none', 'tls', 'starttls'] as const

/**
 * GET /api/settings/smtp → current config (password masked) or { configured: false }
 * Admin-only.
 */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const configured = await isSmtpConfigured()
  if (!configured) {
    return NextResponse.json({ configured: false })
  }

  const config = await getSmtpConfig()
  const password = await getSmtpPasswordMasked()

  return NextResponse.json({
    configured: true,
    host: config?.host ?? '',
    port: config?.port ?? 587,
    user: config?.user ?? '',
    fromAddress: config?.fromAddress ?? '',
    tls: config?.tls ?? 'starttls',
    password: password ?? '',
  })
}

/**
 * PUT /api/settings/smtp → validates + saves config; returns same shape as GET.
 * Admin-only.
 * password === SECRET_MASK → leave stored password unchanged.
 * password === "" → clear stored password (unauthenticated relay).
 */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const { host, port, user: smtpUser, password, fromAddress, tls } = body

  // Validate
  if (!host || typeof host !== 'string' || host.trim() === '') {
    return NextResponse.json({ error: 'host is required' }, { status: 400 })
  }
  const portNum = Number(port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return NextResponse.json({ error: 'port must be between 1 and 65535' }, { status: 400 })
  }
  if (!fromAddress || typeof fromAddress !== 'string' || !fromAddress.includes('@')) {
    return NextResponse.json(
      { error: 'fromAddress is required and must contain @' },
      { status: 400 },
    )
  }
  if (!tls || !TLS_VALUES.includes(tls as (typeof TLS_VALUES)[number])) {
    return NextResponse.json(
      { error: `tls must be one of: ${TLS_VALUES.join(', ')}` },
      { status: 400 },
    )
  }

  const config: SmtpConfig & { password: string } = {
    host: String(host).trim(),
    port: portNum,
    user: typeof smtpUser === 'string' ? smtpUser.trim() : '',
    fromAddress: String(fromAddress).trim(),
    tls: tls as SmtpConfig['tls'],
    password: typeof password === 'string' ? password : '',
  }

  await saveSmtpConfig(config)

  // Return the current state (password masked)
  const saved = await getSmtpConfig()
  const maskedPw = await getSmtpPasswordMasked()

  return NextResponse.json({
    configured: true,
    host: saved?.host ?? config.host,
    port: saved?.port ?? config.port,
    user: saved?.user ?? config.user,
    fromAddress: saved?.fromAddress ?? config.fromAddress,
    tls: saved?.tls ?? config.tls,
    password: maskedPw ?? '',
  })
}

/**
 * DELETE /api/settings/smtp → clears all SMTP config.
 * Admin-only. Useful for a "reset" action.
 */
export async function DELETE(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  await clearSmtpConfig()
  return NextResponse.json({ ok: true })
}
