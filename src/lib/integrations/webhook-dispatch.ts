// J7 webhook dispatcher (server). The fire-and-forget engine that turns a
// workspace event into outbound HTTP POSTs to the owner's configured webhooks.
//
// THE CRUX INVARIANT — NON-BLOCKING + RESILIENT. dispatchWebhooks is called from
// inside saveDocument / createShare / createThread / addReply, which sit in the
// user's critical path (a save, a publish, a comment). It MUST NOT:
//   - block that path (the caller does `void dispatchWebhooks(...)` and returns
//     immediately; the function itself also resolves before the POSTs settle —
//     it schedules them and returns), and
//   - throw into that path (every step is wrapped; a bad/slow/missing webhook
//     target can NEVER fail or slow the user's action).
// A failing webhook is swallowed (logged at debug). With no webhooks configured
// the DB lookup returns [] and nothing happens — off-by-default.
//
// SSRF NOTE (v0.2 GAP): the POST targets are owner-configured URLs. In v0.1 the
// owner is the single trusted user, so an owner pointing a webhook at an internal
// host is self-inflicted. The create API enforces the http(s) scheme today;
// blocking loopback/private-range hosts is an explicit v0.2 multi-user hardening
// item, not done here.

import { db } from '@/db'
import { getWebhook, webhooksForEvent } from '@/lib/docs/webhooks-repo'
import {
  buildRequest,
  isValidWebhookEvent,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  type WebhookPayload,
  type WebhookTarget,
} from '@/lib/integrations/webhooks'

// Per-POST timeout. Kept short so a hung receiver can't pile up open sockets;
// the AbortController fires this and the error is swallowed like any other.
const WEBHOOK_TIMEOUT_MS = 5000

// Touch the imported `db` binding so the module's @/db dependency is real at the
// type level even though the lookup goes through the repo. (The repo owns the
// query; importing db here documents that this is a server-only module.)
void db

/**
 * POST one built request with a short timeout. NEVER throws — any network error,
 * abort/timeout, or non-2xx is swallowed (logged at debug). Returns nothing; the
 * caller does not await the outcome in the critical path.
 */
async function deliver(target: WebhookTarget, event: WebhookEvent, payload: WebhookPayload) {
  let built: ReturnType<typeof buildRequest>
  try {
    built = buildRequest(target, event, payload)
  } catch {
    // A malformed target/event is a config error, not a user error — drop it.
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: built.body,
      signal: controller.signal,
    })
    // We intentionally do NOT inspect res.ok / retry — best-effort, fire-and-forget.
  } catch {
    // Swallow: a webhook failure must never surface to the user's action.
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Dispatch `event` to all of `ownerId`'s active webhooks subscribed to it.
 *
 * Fire-and-forget: callers invoke `void dispatchWebhooks(...)` and do NOT await
 * it in their critical path. This function itself is wrapped end-to-end so it
 * never rejects — even the DB lookup is guarded — so a `void`-ed (un-awaited)
 * call can never raise an unhandled rejection. It loads the matching webhooks and
 * kicks off a non-awaited deliver() per target.
 *
 * Off-by-default: with no matching webhooks the loop body never runs.
 */
export async function dispatchWebhooks(
  ownerId: string,
  event: WebhookEvent,
  payload: WebhookPayload,
): Promise<void> {
  if (!isValidWebhookEvent(event)) return
  try {
    const hooks = await webhooksForEvent(ownerId, event)
    for (const hook of hooks) {
      // Do not await — each delivery is independent and best-effort. deliver()
      // never throws, so an un-awaited promise carries no rejection.
      void deliver({ url: hook.url, secret: hook.secret, kind: hook.kind }, event, payload)
    }
  } catch {
    // Even the lookup is best-effort: a DB hiccup must not fail the user action.
  }
}

/**
 * Send a one-off TEST delivery to a single webhook (the "Send test" button).
 *
 * Unlike dispatchWebhooks this is NOT in the user's critical path — it is an
 * explicit owner action — so we AWAIT the POST and report whether it was accepted
 * (2xx), so the UI can show success/failure. Still resilient: any error resolves
 * to `{ ok: false }` rather than throwing. The test fires using the webhook's
 * first subscribed event (or `document.saved` as a fallback) with a `ping: true`
 * payload, so a generic receiver sees a correctly-signed, well-formed request.
 *
 * Owner-scoped: returns null when the webhook isn't owned by `ownerId`.
 */
export async function sendTestWebhook(
  ownerId: string,
  webhookId: string,
): Promise<{ ok: boolean; status: number } | null> {
  const hook = await getWebhook(ownerId, webhookId)
  if (!hook) return null

  const event: WebhookEvent = hook.events[0] ?? WEBHOOK_EVENTS[0]
  const payload: WebhookPayload = {
    ping: true,
    docId: 'test',
    title: 'Parchment webhook test',
    snippet: 'This is a test delivery from Parchment.',
  }

  let built: ReturnType<typeof buildRequest>
  try {
    built = buildRequest({ url: hook.url, secret: hook.secret, kind: hook.kind }, event, payload)
  } catch {
    return { ok: false, status: 0 }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const res = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: built.body,
      signal: controller.signal,
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  } finally {
    clearTimeout(timer)
  }
}
