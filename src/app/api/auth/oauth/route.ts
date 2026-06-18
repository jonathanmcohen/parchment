import { NextResponse } from 'next/server'

// OAuth sign-in — stubbed for v0.1. Planned for v0.2 (external IdP exchange:
// authorization-code + PKCE, provider config in workspace settings).
const notImplemented = () =>
  NextResponse.json({ error: 'not_implemented', available: 'v0.2' }, { status: 501 })

export const GET = notImplemented
export const POST = notImplemented
