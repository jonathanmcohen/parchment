import { desc } from 'drizzle-orm'
import { AuditLogView, type AuditRow } from '@/components/audit/AuditLogView'
import { db, schema } from '@/db'

export default async function AuditLogPage() {
  const rows = await db
    .select()
    .from(schema.auditLog)
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(100)

  return (
    <section>
      <h1 className="font-semibold text-2xl tracking-tight">Audit log</h1>
      <p className="mt-2 text-[var(--muted)]">
        The 100 most recent events, newest first. Append-only — Plan A4 / I5.
      </p>
      <AuditLogView rows={rows as AuditRow[]} />
    </section>
  )
}
