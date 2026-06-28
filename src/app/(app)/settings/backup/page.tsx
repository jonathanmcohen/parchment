import { RestoreForm, S3BackupNowButton } from '@/components/backup/BackupControls'
import { requireAdmin } from '@/lib/auth/guard'
import { resolveS3Config } from '@/lib/backup/s3-config'
import { getAppConfig, getAppConfigJson } from '@/lib/config/repo'
import { SECRET_MASK } from '@/lib/crypto/mask'
import { resolveGitSyncConfig } from '@/lib/git/sync-config'
import type { JobState } from '@/lib/schedules/jobs'
import { scheduler } from '@/lib/schedules/scheduler'
import { GitSyncForm, type GitSyncInitial } from './GitSyncForm'
import { MigrateSection } from './MigrateSection'
import { S3ConfigForm, type S3FormInitial } from './S3ConfigForm'
import { S3ObjectPicker } from './S3ObjectPicker'
import { SelectiveRestorePicker } from './SelectiveRestorePicker'

export const dynamic = 'force-dynamic'

// backup-sync — the consolidated Backup admin page (promoted to /settings/backup).
// Owns: download/restore, selective restore, S3 config + restore-from-S3, instance
// migration, git sync, and backup health (the backup-verify dashboard, §7l).

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

interface VerifyResult {
  ok: boolean | 'warn' | 'skipped'
  at: string
  docCount?: number
  warnings?: string[]
  error?: string
}

function relativeTime(ms: number | null, nowMs: number): string {
  if (ms === null) return '—'
  const deltaSec = Math.round((ms - nowMs) / 1000)
  if (Math.abs(deltaSec) < 45) return 'just now'
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const minutes = Math.round(deltaSec / 60)
  if (Math.abs(minutes) < 60) return fmt.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return fmt.format(hours, 'hour')
  return fmt.format(Math.round(hours / 24), 'day')
}

export default async function BackupPage() {
  await requireAdmin()
  const now = Date.now()

  const s3 = await resolveS3Config()
  const s3Form: S3FormInitial = {
    endpoint: s3?.endpoint ?? '',
    bucket: s3?.bucket ?? '',
    accessKeyId: s3?.accessKeyId ?? '',
    region: s3?.region ?? 'us-east-1',
    prefix: s3?.prefix ?? '',
    scheduleHours: s3?.scheduleHours ?? 24,
    enabled: s3?.enabled ?? false,
    secretAccessKey: s3?.secretAccessKey ? SECRET_MASK : '',
  }

  const state = scheduler.getState()
  const s3Job = state.find((j) => j.name === 's3-backup') ?? null
  const verifyJob = state.find((j) => j.name === 'backup-verify') ?? null

  const git = await resolveGitSyncConfig()
  const gitStored = await getAppConfigJson<Record<string, unknown>>('git.config')
  const gitTokenSet = (await getAppConfig('git.token')) !== null
  const gitForm: GitSyncInitial = {
    remoteUrl: git?.remoteUrl ?? (gitStored?.remoteUrl as string) ?? '',
    branch: git?.branch ?? (gitStored?.branch as string) ?? 'main',
    authorName: git?.authorName ?? (gitStored?.authorName as string) ?? 'Parchment',
    authorEmail: git?.authorEmail ?? (gitStored?.authorEmail as string) ?? 'parchment@localhost',
    scheduleHours: git?.scheduleHours ?? (gitStored?.scheduleHours as number) ?? 24,
    enabled: git?.enabled ?? Boolean(gitStored?.enabled),
    tokenSet: gitTokenSet,
    lastPush: await getAppConfigJson('git.lastPush'),
    lastError: await getAppConfigJson('git.lastError'),
  }

  const migrateConfigured = (await getAppConfig('migrate.tokenHash')) !== null
  const verifyResult = await getAppConfigJson<VerifyResult>('verify.lastResult')

  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Backup</h1>
      <p className="mt-2 text-[var(--muted)]">
        Download and restore your workspace, configure off-site and git backups, migrate between
        instances, and review backup health.
      </p>

      {/* Download / restore */}
      <section aria-labelledby="backup-download" className="mt-8">
        <h2 id="backup-download" className="font-medium text-lg">
          Download &amp; restore
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          A single <code>.zip</code> with the raw content of every document. Restore is additive.
        </p>
        <p className="mt-3">
          <a
            href="/api/backup/export"
            className="inline-block rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 font-medium text-sm hover:bg-[var(--background)]"
          >
            Download backup
          </a>
        </p>
        <RestoreForm />
        <SelectiveRestorePicker />
      </section>

      {/* S3 config + restore-from-S3 */}
      <section aria-labelledby="backup-s3" className="mt-10">
        <h2 id="backup-s3" className="font-medium text-lg">
          S3 backup
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Scheduled off-site backups to an S3-compatible bucket (AWS S3, MinIO, Cloudflare R2).
        </p>
        <S3ConfigForm initial={s3Form} />
        {s3?.enabled ? (
          <div className="mt-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-[var(--muted)]">Status</dt>
              <dd style={{ color: STATUS_COLOR[s3Job?.lastStatus ?? 'never'] }}>
                {STATUS_LABEL[s3Job?.lastStatus ?? 'never']}
              </dd>
              <dt className="text-[var(--muted)]">Last run</dt>
              <dd>{relativeTime(s3Job?.lastRunAt ?? null, now)}</dd>
            </dl>
            <S3BackupNowButton />
            <S3ObjectPicker />
          </div>
        ) : null}
      </section>

      {/* Instance migration */}
      <section aria-labelledby="backup-migrate" className="mt-10">
        <h2 id="backup-migrate" className="font-medium text-lg">
          Instance migration
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Push your whole workspace to another Parchment instance over HTTPS.
        </p>
        <MigrateSection initialConfigured={migrateConfigured} />
      </section>

      {/* Git sync */}
      <section aria-labelledby="backup-git" className="mt-10">
        <h2 id="backup-git" className="font-medium text-lg">
          Git sync
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Mirror the files-root repo to a remote over HTTPS. Disk is the source of truth — pushes
          only, never merges.
        </p>
        <GitSyncForm initial={gitForm} />
      </section>

      {/* Backup health (verify dashboard — backup-sync owns this) */}
      <section aria-labelledby="backup-health" className="mt-10">
        <h2 id="backup-health" className="font-medium text-lg">
          Backup health
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          A weekly restore-test confirms your backups parse cleanly.
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-[var(--muted)]">Status</dt>
          <dd style={{ color: STATUS_COLOR[verifyJob?.lastStatus ?? 'never'] }}>
            {STATUS_LABEL[verifyJob?.lastStatus ?? 'never']}
          </dd>
          <dt className="text-[var(--muted)]">Last verify</dt>
          <dd>{relativeTime(verifyJob?.lastRunAt ?? null, now)}</dd>
          <dt className="text-[var(--muted)]">Documents</dt>
          <dd className="tabular-nums">{verifyResult?.docCount ?? '—'}</dd>
        </dl>
        {verifyResult?.warnings && verifyResult.warnings.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 text-[var(--muted)] text-xs">
            {verifyResult.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </section>
  )
}
