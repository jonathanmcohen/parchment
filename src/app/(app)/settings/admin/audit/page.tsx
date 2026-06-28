import { desc } from 'drizzle-orm'
import { AuditLogView, type AuditRow } from '@/components/audit/AuditLogView'
import { db, schema } from '@/db'
import { verifyAuditChain } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export default async function AuditLogPage() {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(100)

  // §5.4: re-hash the chain (Phase-0 canonical verifier) and surface a tamper banner.
  const integrity = await verifyAuditChain()

  return (
    <section>
      <h1 className="font-semibold text-2xl tracking-tight">Audit log</h1>
      <p className="mt-2 text-[var(--muted)]">
        The 100 most recent events, newest first. Append-only and hash-chained — Plan A4 / G3.
      </p>
      <AuditLogView rows={rows as AuditRow[]} integrity={integrity} />
    </section>
  )
}
