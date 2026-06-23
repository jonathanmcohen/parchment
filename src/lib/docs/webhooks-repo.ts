import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import {
  isValidWebhookEvent,
  isValidWebhookKind,
  type WebhookEvent,
  type WebhookKind,
} from '@/lib/integrations/webhooks'

// J7 webhook data layer. No 'server-only' guard so the repo stays
// integration-testable; it touches `db` (pg) and is only imported by server
// routes / the dispatcher. Client components must NEVER import this module — it
// pulls in @/db, and (the security crux) it can read the HMAC `secret`.
//
// SECRET HANDLING: the signing `secret` is CSPRNG-generated here and is the one
// piece of a webhook row the client must never see. createWebhook returns it
// exactly once (so the owner can configure their receiver); listWebhooks NEVER
// returns it (it returns a masked placeholder via the API mapping). Treat it like
// a password hash: server-only, never logged.

export type Webhook = typeof schema.webhooks.$inferSelect

/** A webhook with its `events` jsonb narrowed to the validated WebhookEvent[]. */
export type WebhookRow = Omit<Webhook, 'events' | 'kind'> & {
  events: WebhookEvent[]
  kind: WebhookKind
}

const SECRET_PREFIX = 'whsec_'

// 32 bytes of CSPRNG entropy, base64url — same strength as the PAT/share tokens.
function generateSecret(): string {
  return SECRET_PREFIX + randomBytes(32).toString('base64url')
}

// Narrow the raw jsonb `events` to a validated WebhookEvent[] and `kind` to a
// validated WebhookKind, dropping anything unrecognized. The DB column is jsonb
// (untyped at the type level); this keeps callers honest.
function normalize(row: Webhook): WebhookRow {
  const events = Array.isArray(row.events) ? row.events.filter(isValidWebhookEvent) : []
  const kind: WebhookKind = isValidWebhookKind(row.kind) ? row.kind : 'generic'
  return { ...row, events, kind }
}

/**
 * Create a webhook for an owner. The signing `secret` is generated server-side
 * (CSPRNG) and returned ONCE here. `events` is filtered to the valid set; an
 * invalid kind falls back to 'generic'. Returns the row (incl. secret) so the
 * caller can show the secret a single time — list/other reads must mask it.
 */
export async function createWebhook(
  ownerId: string,
  opts: { url: string; kind: WebhookKind; events: readonly WebhookEvent[] },
): Promise<WebhookRow> {
  const events = opts.events.filter(isValidWebhookEvent)
  const kind: WebhookKind = isValidWebhookKind(opts.kind) ? opts.kind : 'generic'
  const secret = generateSecret()

  const [row] = await db
    .insert(schema.webhooks)
    .values({ ownerId, url: opts.url, secret, kind, events })
    .returning()

  if (!row) throw new Error('createWebhook: insert returned no row')
  return normalize(row)
}

/** All of an owner's webhooks, newest-first. Includes the secret column — the
 *  API maps to a safe shape and NEVER sends the secret to the client. */
export async function listWebhooks(ownerId: string): Promise<WebhookRow[]> {
  const rows = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.ownerId, ownerId))
    .orderBy(desc(schema.webhooks.createdAt))
  return rows.map(normalize)
}

/** Fetch one webhook owned by `ownerId`, or null. */
export async function getWebhook(ownerId: string, id: string): Promise<WebhookRow | null> {
  const [row] = await db
    .select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.ownerId, ownerId)))
    .limit(1)
  return row ? normalize(row) : null
}

/** Delete a webhook (owner-scoped). Returns true iff a row was removed. */
export async function deleteWebhook(ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(schema.webhooks)
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.ownerId, ownerId)))
    .returning({ id: schema.webhooks.id })
  return deleted.length > 0
}

/** Enable/disable a webhook (owner-scoped). Returns true iff a row was updated. */
export async function setActive(ownerId: string, id: string, active: boolean): Promise<boolean> {
  const updated = await db
    .update(schema.webhooks)
    .set({ active })
    .where(and(eq(schema.webhooks.id, id), eq(schema.webhooks.ownerId, ownerId)))
    .returning({ id: schema.webhooks.id })
  return updated.length > 0
}

/**
 * The owner's ACTIVE webhooks subscribed to `event`. This is the dispatch lookup:
 * inherently off-by-default (no rows → empty array → no calls). The `active`
 * filter is applied in SQL; the `events`-contains filter is applied in JS over
 * the jsonb array (small N per owner) after normalize().
 */
export async function webhooksForEvent(
  ownerId: string,
  event: WebhookEvent,
): Promise<WebhookRow[]> {
  if (!isValidWebhookEvent(event)) return []
  const rows = await db
    .select()
    .from(schema.webhooks)
    .where(and(eq(schema.webhooks.ownerId, ownerId), eq(schema.webhooks.active, true)))
  return rows.map(normalize).filter((w) => w.events.includes(event))
}
