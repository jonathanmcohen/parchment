import { db, schema } from '@/db'

// Append-only audit trail (A4 / I5). The closed set of auditable verbs.
export type AuditAction = 'create' | 'delete' | 'share' | 'export' | 'login'

export interface AuditOptions {
  actorId?: string
  targetType?: string
  targetId?: string
  meta?: Record<string, unknown>
}

// Write a single audit row. This MUST NEVER throw to the caller — auditing is a
// side-effect of the real action and must not be able to block or fail it.
export async function logAudit(action: AuditAction, opts: AuditOptions = {}): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      action,
      actorId: opts.actorId ?? null,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      meta: opts.meta ?? null,
    })
  } catch (err) {
    console.error('audit write failed', { action, opts, err })
  }
}
