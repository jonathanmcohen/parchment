import { RestoreForm, S3BackupNowButton } from '@/components/backup/BackupControls'
import { requireAdmin } from '@/lib/auth/guard'
import { isS3Configured } from '@/lib/backup/s3'
import type { JobState } from '@/lib/schedules/jobs'
import { scheduler } from '@/lib/schedules/scheduler'

export const dynamic = 'force-dynamic'

// I4 — Backup admin page (server component). Download / restore a workspace
// backup, plus the scheduled-S3 status. S3 is OFF-UNLESS-CONFIGURED: when the
// four BACKUP_S3_* env vars are absent the 's3-backup' job isn't registered, so
// this page shows the configuration hint instead of the job status.

const STATUS_COLOR: Record<JobState['lastStatus'], string> = {
  never: 'var(--muted)',
  ok: 'var(--success)',
  error: 'var(--error)',
}
const STATUS_LABEL: Record<JobState['lastStatus'], string> = {
  never: 'Never run',
  ok: 'OK',
  error: 'Error',
}

const S3_ENV_VARS = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
]

function relativeTime(ms: number | null, nowMs: number): string {
  if (ms === null) return '—'
  const deltaSec = Math.round((ms - nowMs) / 1000)
  if (Math.abs(deltaSec) < 45) return 'just now'
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const minutes = Math.round(deltaSec / 60)
  if (Math.abs(minutes) < 60) return fmt.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return fmt.format(hours, 'hour')
  const days = Math.round(hours / 24)
  return fmt.format(days, 'day')
}

export default async function BackupPage() {
  await requireAdmin()

  const configured = isS3Configured()
  const now = Date.now()
  // getState() registers the defaults; the s3-backup job is present only when
  // configured (off-unless-configured), so this is null on an unconfigured host.
  const s3Job = configured
    ? (scheduler.getState().find((j) => j.name === 's3-backup') ?? null)
    : null

  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Backup</h1>
      <p className="mt-2 text-[var(--muted)]">
        Download a lossless archive of your whole workspace, restore from one, and review scheduled
        off-site backups.
      </p>

      <section aria-labelledby="backup-download" className="mt-8">
        <h2 id="backup-download" className="font-medium text-lg">
          Download backup
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          A single <code>.zip</code> with the raw content of every document — diagrams, math, and
          citations included. This is the lossless format used for restore.
        </p>
        <p className="mt-3">
          <a
            href="/api/backup/export"
            className="inline-block rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)]"
          >
            Download backup
          </a>
        </p>
      </section>

      <section aria-labelledby="backup-restore" className="mt-8">
        <h2 id="backup-restore" className="font-medium text-lg">
          Restore from backup
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Upload a backup <code>.zip</code> to re-create its documents. Restore is additive — it
          creates new documents and never overwrites existing ones.
        </p>
        <RestoreForm />
      </section>

      <section aria-labelledby="backup-s3" className="mt-8">
        <h2 id="backup-s3" className="font-medium text-lg">
          Scheduled off-site backup (S3)
        </h2>
        {configured ? (
          <div className="mt-1">
            <p className="text-[var(--muted)] text-sm">
              S3 is configured. A backup is uploaded automatically every 24 hours.
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-[var(--muted)]">Status</dt>
              <dd style={{ color: STATUS_COLOR[s3Job?.lastStatus ?? 'never'] }}>
                {STATUS_LABEL[s3Job?.lastStatus ?? 'never']}
              </dd>
              <dt className="text-[var(--muted)]">Last run</dt>
              <dd>{relativeTime(s3Job?.lastRunAt ?? null, now)}</dd>
              <dt className="text-[var(--muted)]">Next run</dt>
              <dd>{relativeTime(s3Job?.nextRunAt ?? null, now)}</dd>
              <dt className="text-[var(--muted)]">Runs</dt>
              <dd className="tabular-nums">{s3Job?.runCount ?? 0}</dd>
            </dl>
            {s3Job?.lastError ? (
              <p className="mt-2 break-words text-xs" style={{ color: 'var(--error)' }}>
                {s3Job.lastError}
              </p>
            ) : null}
            <S3BackupNowButton />
          </div>
        ) : (
          <div className="mt-1">
            <p className="text-[var(--muted)] text-sm">
              Off-site backups are disabled. To enable a scheduled upload to an S3-compatible bucket
              (AWS S3, MinIO, Cloudflare R2), set these environment variables and restart:
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {S3_ENV_VARS.map((v) => (
                <li key={v}>
                  <code>{v}</code>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[var(--muted)] text-xs">
              <code>BACKUP_S3_REGION</code> is optional (defaults to <code>us-east-1</code>).
            </p>
          </div>
        )}
      </section>
    </section>
  )
}
