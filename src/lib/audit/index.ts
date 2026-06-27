import { createHash } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// ─── Merged AuditAction union (Phase 0 §1d) ─────────────────────────────────
// A's verbs + G's verbs in one closed set. Extend by ADDING to this union,
// never by replacing it. All call-sites must stay type-safe after extension.
//
// CANONICAL DOTTED VERB LIST (§1d). BANNED variants — NEVER use these underscored /
// _change / _grant forms anywhere in the repo:
//   user.role_change, doc.permission_grant, doc.permission_revoke,
//   doc.permission_change, oidc_config, login_locked, session_revoke,
//   mfa_enable, mfa_disable.
export type AuditAction =
  // Pre-existing / legacy verbs (A4 / I5 / setup bootstrap — §7b).
  // 'setup' is emitted by src/app/setup/actions.ts; G converts that call-site to typed
  // logAudit, so 'setup' MUST remain in the union or typecheck fails.
  | 'create'
  | 'delete'
  | 'share'
  | 'export'
  | 'login'
  | 'setup'
  // A's user lifecycle verbs — ALL DOTTED per §1d canonical list.
  | 'user.create'
  | 'user.invite'
  | 'user.disable'
  | 'user.enable'
  | 'user.delete'
  | 'user.role'
  | 'ownership.transfer'
  // A's document permission verbs — ALL DOTTED per §1d canonical list.
  | 'doc.share'
  | 'doc.unshare'
  // G's security verbs — ALL DOTTED per §1d canonical list.
  | 'session.revoke'
  | 'mfa.enable'
  | 'mfa.disable'
  | 'oidc.config'
  | 'login.locked'

export interface AuditOptions {
  actorId?: string
  targetType?: string
  /**
   * text, not uuid — any identifier string is valid post-migration 0021.
   * MUST NOT contain a secret: it is persisted in plaintext and is bound as a query
   * param (so a DB error could surface it). Redact with SECRET_MASK first if needed.
   */
  targetId?: string
  /**
   * Arbitrary structured context, stored as plaintext jsonb. MUST NOT contain secrets
   * (passwords, tokens, keys) — audit rows are not encrypted and meta is bound as a
   * query param. Callers redact sensitive fields (e.g. via redactSecret) before passing.
   */
  meta?: Record<string, unknown>
  /** Caller's best-effort client IP. Stored in audit_log.ip. */
  ip?: string
}

// Compute a row's entry_hash. MUST use the PERSISTED row's created_at (§7c) so that
// verifyAuditChain — which reads created_at back from storage — re-derives the same
// value. NEVER pass Date.now() here: the DB `now()` and the app clock differ, which
// would make every chain fail to verify.
function computeEntryHash(args: {
  action: string
  actorId: string | null
  targetId: string | null
  prevHash: string | null
  createdAtMs: string
}): string {
  return createHash('sha256')
    .update(
      [
        args.action,
        args.actorId ?? '',
        args.targetId ?? '',
        args.prevHash ?? '',
        args.createdAtMs,
      ].join('|'),
    )
    .digest('hex')
}

/**
 * Write a single audit row with a sha256 hash chain.
 *
 * prev_hash:  the previous row's entry_hash (or null for the first row).
 * entry_hash: sha256(`${action}|${actorId}|${targetId}|${prev_hash}|${dbCreatedAtMs}`)
 *   where dbCreatedAtMs = new Date(insertedRow.created_at).getTime().toString().
 *
 * The insert→returning(created_at)→back-fill(entry_hash) runs in one transaction so
 * the chain read and the hash write are consistent. The append-only trigger permits the
 * NULL→hash back-fill (and nothing else), so this works WITHOUT superuser privileges.
 *
 * This MUST NEVER throw to the caller — auditing is a side-effect of the real action and
 * must not be able to block or fail it. On any error it logs (action + the option KEYS
 * only — never opts.meta values, which could carry sensitive fields) and returns.
 */
export async function logAudit(action: AuditAction, opts: AuditOptions = {}): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Most-recent entry_hash builds the chain link.
      const [prev] = await tx
        .select({ entryHash: schema.auditLog.entryHash })
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
        .limit(1)
      const prevHash = prev?.entryHash ?? null

      const [inserted] = await tx
        .insert(schema.auditLog)
        .values({
          action,
          actorId: opts.actorId ?? null,
          targetType: opts.targetType ?? null,
          targetId: opts.targetId ?? null,
          meta: opts.meta ?? null,
          ip: opts.ip ?? null,
          prevHash,
          entryHash: null,
        })
        .returning({ id: schema.auditLog.id, createdAt: schema.auditLog.createdAt })
      if (!inserted) throw new Error('audit insert returned no row')

      const createdAtMs = new Date(inserted.createdAt).getTime().toString()
      const entryHash = computeEntryHash({
        action,
        actorId: opts.actorId ?? null,
        targetId: opts.targetId ?? null,
        prevHash,
        createdAtMs,
      })

      // Back-fill the hash (trigger allows ONLY this NULL→non-NULL transition).
      await tx.update(schema.auditLog).set({ entryHash }).where(eq(schema.auditLog.id, inserted.id))
    })
  } catch (err) {
    // Never log opts.meta/targetId VALUES — they may carry secrets — only the action
    // and the top-level option key names. Crucially we DON'T log the raw `err` either:
    // DrizzleQueryError builds its `.message` as `Failed query: <sql>\nparams: <values>`
    // and exposes `.params` — i.e. the BOUND param values (which include meta/targetId/
    // ip) are embedded in the message. A misused secret in those would otherwise leak.
    // So we log only the error class name and a param-stripped message (everything from
    // a `params:` marker onward is dropped; our own thrown errors are literal + safe).
    console.error('audit write failed', {
      action,
      optKeys: Object.keys(opts),
      errName: err instanceof Error ? err.name : 'Error',
      errMessage: redactQueryParams(err),
    })
  }
}

// Strip bound-parameter VALUES from an error message so a secret a caller may have
// (mis)placed in meta/targetId/ip cannot surface via the log. Drops everything from the
// first `params:`/`parameters:` marker onward; non-query errors pass through unchanged.
function redactQueryParams(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.split(/\n?\s*param(?:eter)?s?:/i)[0]?.trim() ?? ''
}

// Extract a best-effort client IP from a request's headers: the first
// X-Forwarded-For hop (closest the app can get behind a proxy), else x-real-ip.
// Returns undefined when neither is present so logAudit writes a NULL ip column
// (NOT the string "unknown"). Never throws — a hostile/odd headers object is
// swallowed and yields undefined.
function ipFromHeaders(req: { headers: Headers }): string | undefined {
  try {
    const xff = req.headers.get('x-forwarded-for')
    if (xff) {
      const first = xff.split(',')[0]?.trim()
      if (first) return first
    }
    const real = req.headers.get('x-real-ip')?.trim()
    return real || undefined
  } catch {
    return undefined
  }
}

/**
 * Convenience wrapper for route handlers (§5.1): resolves the caller's IP from the
 * request headers and forwards it to logAudit. Like logAudit it NEVER throws —
 * auditing is a side-effect and must not be able to fail the real action. `opts.ip`
 * is not expected (the IP is derived from `req`); any other AuditOptions pass through.
 */
export async function logAuditRequest(
  action: AuditAction,
  req: { headers: Headers },
  opts: Omit<AuditOptions, 'ip'> = {},
): Promise<void> {
  const ip = ipFromHeaders(req)
  await logAudit(action, ip === undefined ? opts : { ...opts, ip })
}

/**
 * Re-hash the prev_hash→entry_hash chain for every row in audit_log (created_at ASC)
 * and return the first row whose stored entry_hash does not match the recomputed value.
 *
 * The expected entry_hash for each row is:
 *   sha256(`${action}|${actorId ?? ''}|${targetId ?? ''}|${prevHash ?? ''}|${createdAtMs}`)
 * with createdAtMs = new Date(row.created_at).getTime().toString().
 *
 * Stops at the FIRST mismatch (subsequent hashes chain off it and would also be wrong),
 * returning { ok: false, brokenAt: <the stored entry_hash of that first broken row> }.
 * Returns { ok: true } if the chain is intact (or empty).
 *
 * Trust model: this detects tampering of a stored hash, an altered field, or a
 * NULL-left entry_hash. It is only as strong as the append-only trigger (which blocks
 * UPDATE/DELETE) — a superuser that suppresses triggers can rewrite the whole chain;
 * the trigger is the enforcement boundary, this is the detection layer.
 */
export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAt?: string }> {
  const rows = await db
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      targetId: schema.auditLog.targetId,
      prevHash: schema.auditLog.prevHash,
      entryHash: schema.auditLog.entryHash,
      createdAt: schema.auditLog.createdAt,
    })
    .from(schema.auditLog)
    .orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id))

  for (const row of rows) {
    const createdAtMs = new Date(row.createdAt).getTime().toString()
    const expected = computeEntryHash({
      action: row.action,
      actorId: row.actorId ?? null,
      targetId: row.targetId ?? null,
      prevHash: row.prevHash ?? null,
      createdAtMs,
    })
    if (row.entryHash !== expected) {
      // Only include brokenAt when there's a stored hash to report (exactOptionalPropertyTypes).
      return row.entryHash === null ? { ok: false } : { ok: false, brokenAt: row.entryHash }
    }
  }
  return { ok: true }
}
