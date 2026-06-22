import { NextResponse } from 'next/server'

// v0.2 intent: SP-initiated SAML/OIDC SSO — assertion validation, JIT user
// provisioning under the single workspace, metadata endpoint. Until then every
// method returns 501 so the v0.2 implementation has a clear home.
const notImplemented = () =>
  NextResponse.json(
    { error: 'sso_not_available', message: 'SSO is planned for v0.2' },
    { status: 501 },
  )

export const GET = notImplemented
export const POST = notImplemented
