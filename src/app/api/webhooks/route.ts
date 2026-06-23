import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { createWebhook, listWebhooks, type WebhookRow } from '@/lib/docs/webhooks-repo'
import {
  isValidWebhookKind,
  isValidWebhookUrl,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhookKind,
} from '@/lib/integrations/webhooks'

export const dynamic = 'force-dynamic'

// A masked stand-in for the signing secret. The real secret is shown EXACTLY
// once, in the create response; list responses never carry it.
const SECRET_MASK = '••••••••'

// Map a stored webhook row to a safe client shape. NEVER includes the real
// `secret` (only a mask). Used by GET list.
function toClient(w: WebhookRow) {
  return {
    id: w.id,
    url: w.url,
    kind: w.kind,
    events: w.events,
    active: w.active,
    secretMask: SECRET_MASK,
    createdAt: w.createdAt,
  }
}

// GET /api/webhooks — list the owner's webhooks (never the secret).
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const webhooks = await listWebhooks(user.id)
  return NextResponse.json({ webhooks: webhooks.map(toClient) })
}

// POST /api/webhooks — create a webhook (owner-only).
// Body: { url, kind: generic|slack|discord, events: WebhookEvent[] }.
// The signing secret is generated server-side and returned EXACTLY ONCE here.
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    url?: unknown
    kind?: unknown
    events?: unknown
  }

  if (!isValidWebhookUrl(body.url)) {
    return NextResponse.json({ error: 'invalid_url' }, { status: 400 })
  }
  const url = body.url as string

  if (!isValidWebhookKind(body.kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 })
  }
  const kind: WebhookKind = body.kind

  // events must be a non-empty subset of WEBHOOK_EVENTS.
  const rawEvents = Array.isArray(body.events) ? body.events : []
  const validSet = new Set<string>(WEBHOOK_EVENTS)
  const allValid = rawEvents.every((e) => typeof e === 'string' && validSet.has(e))
  if (!allValid || rawEvents.length === 0) {
    return NextResponse.json({ error: 'invalid_events' }, { status: 400 })
  }
  const events = rawEvents as WebhookEvent[]

  const created = await createWebhook(user.id, { url, kind, events })

  // The plaintext secret is returned exactly once (generic webhooks need it to
  // verify the HMAC). For slack/discord it is unused by the receiver but is still
  // only shown here, never on subsequent reads.
  return NextResponse.json(
    {
      id: created.id,
      url: created.url,
      kind: created.kind,
      events: created.events,
      active: created.active,
      secret: created.secret,
      createdAt: created.createdAt,
    },
    { status: 201 },
  )
}
