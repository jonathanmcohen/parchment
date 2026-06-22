import Link from 'next/link'

export default function AdminSettingsPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Admin</h1>
      <p className="mt-2 text-[var(--muted)]">
        Operational controls for owners and administrators.
      </p>

      <section aria-labelledby="admin-observability" className="mt-8">
        <h2 id="admin-observability" className="font-medium text-lg">
          Observability
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Review activity and check the health of background services.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          <li>
            <Link
              href="/settings/admin/audit"
              className="block rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-3 hover:bg-[var(--background)]"
            >
              <span className="font-medium text-sm">Audit log</span>
              <span className="mt-0.5 block text-[var(--muted)] text-sm">
                A searchable record of who did what, and when (Plan A4).
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/settings/admin/health"
              className="block rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-3 hover:bg-[var(--background)]"
            >
              <span className="font-medium text-sm">Health</span>
              <span className="mt-0.5 block text-[var(--muted)] text-sm">
                Live status of the database, collaboration server, and storage (Plan A5).
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="admin-maintenance" className="mt-8">
        <h2 id="admin-maintenance" className="font-medium text-lg">
          Maintenance
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">Recurring jobs and data protection.</p>
        <ul className="mt-4 flex flex-col gap-2">
          <li>
            <Link
              href="/settings/admin/schedules"
              className="block rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-3 hover:bg-[var(--background)]"
            >
              <span className="font-medium text-sm">Schedules</span>
              <span className="mt-0.5 block text-[var(--muted)] text-sm">
                Automated cleanup and reporting jobs, enabled by default (Plan I10).
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/settings/admin/backup"
              className="block rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-3 hover:bg-[var(--background)]"
            >
              <span className="font-medium text-sm">Backup</span>
              <span className="mt-0.5 block text-[var(--muted)] text-sm">
                Download, restore, and configure scheduled off-site backups (Plan I4).
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </section>
  )
}
