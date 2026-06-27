import Link from 'next/link'
import { isSmtpConfigured } from '@/lib/config/smtp-config-repo'
import { probeDatabase } from '@/lib/health/probes'

/**
 * Post-setup configuration wizard (I4-T3).
 *
 * Shown after the owner account is created (redirected from /setup via actions.ts).
 * Informational only — not a gate. Users can navigate directly to / instead.
 *
 * Shows:
 *   1. DB connectivity (via probeDatabase)
 *   2. SMTP status (via isSmtpConfigured() — DB-backed, no SMTP_* env vars, per §1f)
 *   3. S3 env-var checklist
 *   4. "Continue" button → /
 */

const S3_VARS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
] as const

export const dynamic = 'force-dynamic'

export default async function SetupConfigPage() {
  const [db, smtpConfigured] = await Promise.all([probeDatabase(), isSmtpConfigured()])

  const s3Vars = S3_VARS.map((key) => ({
    key,
    set: !!process.env[key],
  }))

  const allS3Set = s3Vars.every((v) => v.set)

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">Setup complete</h1>
        <p className="text-[var(--muted)]">
          Your workspace is ready. Review the optional integrations below.
        </p>
      </div>

      {/* 1. DB connectivity */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Database</h2>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              db.status === 'up' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {db.status === 'up' ? 'Connected' : 'Error'}
          </span>
          {db.detail && <span className="text-[var(--muted)] text-sm">{db.detail}</span>}
        </div>
      </section>

      {/* 2. Email (SMTP) — DB-backed check, no SMTP_* env vars (§1f) */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">Email (SMTP)</h2>
        {smtpConfigured ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-green-800 text-xs font-medium">
              Configured
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 text-xs font-medium w-fit">
              Not configured
            </span>
            <p className="text-[var(--muted)] text-sm">
              Without SMTP, invite emails and notifications won't be sent.{' '}
              <Link href="/settings/admin/smtp" className="underline">
                Configure in admin settings
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      {/* 3. S3 off-site backup env checklist */}
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-lg">S3 backup (optional)</h2>
        {allS3Set ? (
          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-green-800 text-xs font-medium w-fit">
            Configured
          </span>
        ) : (
          <span className="inline-flex rounded-full bg-[var(--muted)] bg-opacity-20 px-2 py-0.5 text-xs font-medium w-fit text-[var(--muted)]">
            Not configured — set env vars to enable
          </span>
        )}
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {s3Vars.map(({ key, set }) => (
            <li key={key} className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${set ? 'bg-green-500' : 'bg-[var(--muted)]'}`}
              />
              <code className="text-xs">{key}</code>
              <span className="text-[var(--muted)] text-xs">{set ? 'set' : 'not set'}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Continue */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-[var(--accent)] px-6 py-2 font-medium text-white hover:opacity-90"
        >
          Continue to workspace
        </Link>
      </div>
    </main>
  )
}
