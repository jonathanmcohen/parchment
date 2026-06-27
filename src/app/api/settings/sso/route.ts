import { type NextRequest, NextResponse } from 'next/server'
import { logAuditRequest } from '@/lib/audit'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import { discoverOidc } from '@/lib/auth/oidc-client'
import {
  DEFAULT_OIDC_SCOPES,
  getOidcConfig,
  getOidcConfigForDisplay,
  saveOidcConfig,
} from '@/lib/auth/oidc-config'
import { SECRET_MASK } from '@/lib/crypto/secret-box'

// GET /api/settings/sso → current display config (secret masked, never decrypted).
// Admin-only.
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const display = await getOidcConfigForDisplay()
  return NextResponse.json({
    enabled: display.enabled,
    issuerUrl: display.issuerUrl,
    clientId: display.clientId,
    // The form shows the mask when a secret is stored; the plaintext NEVER leaves here.
    clientSecret: display.hasSecret ? SECRET_MASK : '',
    scopes: display.scopes,
  })
}

// PUT /api/settings/sso → validate (discovery) + save. Admin-only. The client secret
// is write-only: SECRET_MASK leaves it unchanged, '' clears it. On a non-trivial save
// (enabled or a real issuer), we run discovery once ("test before save") and reject
// with a clear error if it fails. Audits 'oidc.config' with NO secret in meta.
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

  const enabled = body.enabled === true
  const issuerUrl = typeof body.issuerUrl === 'string' ? body.issuerUrl.trim() : ''
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  const clientSecret = typeof body.clientSecret === 'string' ? body.clientSecret : undefined
  const scopes =
    typeof body.scopes === 'string' && body.scopes.trim() ? body.scopes.trim() : DEFAULT_OIDC_SCOPES

  // Basic shape validation when enabling.
  if (enabled) {
    if (!issuerUrl) return NextResponse.json({ error: 'issuerUrl is required' }, { status: 400 })
    if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 })
    let issuerOk = false
    try {
      issuerOk = ['http:', 'https:'].includes(new URL(issuerUrl).protocol)
    } catch {
      issuerOk = false
    }
    if (!issuerOk) {
      return NextResponse.json({ error: 'issuerUrl must be a valid http(s) URL' }, { status: 400 })
    }
  }

  // Persist first (so the secret is stored encrypted), then validate via discovery using
  // the now-stored, decrypted config. This lets the mask/unchanged-secret path work and
  // ensures the secret never travels in the request more than once.
  await saveOidcConfig({ enabled, issuerUrl, clientId, clientSecret, scopes })

  if (enabled) {
    const stored = await getOidcConfig()
    if (!stored?.clientSecret) {
      return NextResponse.json(
        { error: 'a client secret is required to enable SSO' },
        { status: 400 },
      )
    }
    try {
      await discoverOidc(stored)
    } catch {
      return NextResponse.json(
        { error: 'OIDC discovery failed — check the issuer URL and credentials' },
        { status: 400 },
      )
    }
  }

  // Audit the config change — NO secret in meta.
  await logAuditRequest('oidc.config', req, {
    actorId: user.id,
    targetType: 'config',
    targetId: 'oidc',
    meta: { enabled, issuerUrl, clientId },
  })

  const display = await getOidcConfigForDisplay()
  return NextResponse.json({
    enabled: display.enabled,
    issuerUrl: display.issuerUrl,
    clientId: display.clientId,
    clientSecret: display.hasSecret ? SECRET_MASK : '',
    scopes: display.scopes,
  })
}
