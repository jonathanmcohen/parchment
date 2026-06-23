// J7 / J4: webhook payload shaping + HMAC signing (PURE).
//
// Framework-free and side-effect-free so it can be unit-tested in node without a
// DB, network, or secrets. It uses only `node:crypto` (createHmac — the same
// idiom as src/lib/auth/mfa.ts) which is pure JS, safe in a server bundle, and
// must NEVER be pulled into a client bundle. The dispatcher (webhook-dispatch.ts)
// and repo (webhooks-repo.ts) own all I/O; this module just builds the request.
//
// SECURITY: `signPayload` proves the request came from this server. The secret is
// the HMAC key — it is NEVER placed in any request this module emits; only the
// resulting signature (`sha256=<hex>`) is sent, in the X-Parchment-Signature
// header, for GENERIC webhooks. Slack/Discord URLs are themselves the secret, so
// those requests carry NO signature header (adding one would leak nothing but is
// pointless — the receiver can't verify it).

import { createHmac } from 'node:crypto'

/** The three workspace events a webhook can subscribe to. */
export const WEBHOOK_EVENTS = ['document.saved', 'document.published', 'comment.created'] as const

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

/** Preset request shapes. 'generic' = HMAC-signed raw JSON; slack/discord = a
 *  formatted message POSTed to an incoming-webhook URL. */
export type WebhookKind = 'generic' | 'slack' | 'discord'

export const WEBHOOK_KINDS: readonly WebhookKind[] = ['generic', 'slack', 'discord']

/** A webhook payload is an arbitrary JSON-serializable record built by the
 *  trigger site (e.g. { docId, title } for document.saved). */
export type WebhookPayload = Record<string, unknown>

/** The minimal webhook shape buildRequest needs — a subset of the DB row, so the
 *  pure module never depends on the schema/drizzle. */
export interface WebhookTarget {
  url: string
  secret: string
  kind: WebhookKind
}

/** A fully-shaped outbound HTTP request, ready for fetch(). `headers` is a plain
 *  record; `body` is the exact serialized string the signature (if any) covers. */
export interface BuiltRequest {
  url: string
  headers: Record<string, string>
  body: string
}

const SIGNATURE_HEADER = 'X-Parchment-Signature'
const EVENT_HEADER = 'X-Parchment-Event'

/** True iff `event` is one of the three supported event ids. */
export function isValidWebhookEvent(event: unknown): event is WebhookEvent {
  return typeof event === 'string' && (WEBHOOK_EVENTS as readonly string[]).includes(event)
}

/** True iff `kind` is one of the supported webhook kinds. */
export function isValidWebhookKind(kind: unknown): kind is WebhookKind {
  return typeof kind === 'string' && (WEBHOOK_KINDS as readonly string[]).includes(kind)
}

/**
 * True iff `url` is a syntactically valid http: or https: URL. This is the
 * scheme guard applied at create-time (the API) so a webhook can never be saved
 * with a `javascript:`, `file:`, `data:`, or `ftp:` target. (SSRF to
 * internal/loopback hosts for a generic owner-configured URL is a v0.1
 * single-user non-issue and an explicit v0.2 multi-user hardening GAP — see the
 * dispatcher.)
 */
export function isValidWebhookUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return u.protocol === 'http:' || u.protocol === 'https:'
}

/**
 * HMAC-SHA256 of `body` keyed by `secret`, rendered as `sha256=<lowercase hex>`.
 * Stable and deterministic: the same (secret, body) always produces the same
 * value, and it changes whenever either input changes. The receiver re-computes
 * this over the raw request body with its copy of the secret and compares.
 */
export function signPayload(secret: string, body: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex')
  return `sha256=${digest}`
}

/** A short, human-readable summary line for an event + payload, shared by the
 *  Slack and Discord formatters. Reads optional `title`/`snippet`/`docId` off the
 *  payload defensively (any may be absent). */
function summarize(event: WebhookEvent, payload: WebhookPayload): string {
  const title = typeof payload.title === 'string' ? payload.title : ''
  const snippet = typeof payload.snippet === 'string' ? payload.snippet : ''
  switch (event) {
    case 'document.saved':
      return `Document saved${title ? `: ${title}` : ''}`
    case 'document.published':
      return `Document published${title ? `: ${title}` : ''}`
    case 'comment.created':
      return `New comment${snippet ? `: ${snippet}` : ''}`
  }
}

/** A Slack incoming-webhook message body for an event. Slack expects `{ text }`
 *  (Markdown-ish). Pure — no network. */
export function formatSlack(event: WebhookEvent, payload: WebhookPayload): { text: string } {
  return { text: summarize(event, payload) }
}

/** A Discord incoming-webhook message body for an event. Discord expects
 *  `{ content }`. Pure — no network. */
export function formatDiscord(event: WebhookEvent, payload: WebhookPayload): { content: string } {
  return { content: summarize(event, payload) }
}

/**
 * Shape the outbound HTTP request for one webhook target + event + payload.
 *
 * Validates the event id FIRST (throws on an unknown event — the caller is the
 * trusted dispatcher/test, never raw user input; this guards a programming
 * error). Then:
 *   - GENERIC: body = JSON.stringify({ event, data: payload }); headers carry
 *     `X-Parchment-Event` and `X-Parchment-Signature` = signPayload(secret, body)
 *     computed over THAT EXACT body, so the receiver's recomputation matches.
 *   - SLACK / DISCORD: body = the formatted message JSON; NO signature/event
 *     headers (those incoming-webhook URLs are the secret and have no HMAC step).
 *
 * The returned `body` is the exact string to send; the signature (generic) is
 * computed over it, so a caller must POST `body` verbatim.
 */
export function buildRequest(
  webhook: WebhookTarget,
  event: WebhookEvent,
  payload: WebhookPayload,
): BuiltRequest {
  if (!isValidWebhookEvent(event)) {
    throw new Error(`buildRequest: unknown webhook event "${String(event)}"`)
  }

  if (webhook.kind === 'slack') {
    return {
      url: webhook.url,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formatSlack(event, payload)),
    }
  }

  if (webhook.kind === 'discord') {
    return {
      url: webhook.url,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formatDiscord(event, payload)),
    }
  }

  // generic
  const body = JSON.stringify({ event, data: payload })
  return {
    url: webhook.url,
    headers: {
      'Content-Type': 'application/json',
      [EVENT_HEADER]: event,
      [SIGNATURE_HEADER]: signPayload(webhook.secret, body),
    },
    body,
  }
}
