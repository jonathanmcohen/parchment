import { NextResponse } from 'next/server'

// SAML/OIDC SSO — stubbed for v0.1. Planned for v0.2 (SP-initiated flow,
// assertion validation, JIT user provisioning under the single workspace).
const notImplemented = () =>
  NextResponse.json({ error: 'not_implemented', available: 'v0.2' }, { status: 501 })

export const GET = notImplemented
export const POST = notImplemented
