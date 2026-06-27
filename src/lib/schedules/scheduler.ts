import { db, schema } from '@/db'
import { isS3Configured, uploadToS3 } from '@/lib/backup/s3'
import { isS3Active } from '@/lib/backup/s3-config'
import { createWorkspaceBackup } from '@/lib/backup/service'
import { purgeExpiredTrash } from '@/lib/docs/repo'
import { getTrashRetentionDays } from '@/lib/docs/settings-repo'
import { type JobState, Scheduler } from '@/lib/schedules/jobs'

// I10 — the in-process scheduler SINGLETON. This is the server-only composition
// layer over the pure, timer-free core in `./jobs.ts`: it registers the real,
// DB-backed default jobs, owns the single `setInterval`, and is the module
// imported by `instrumentation.ts` (dynamically, so it's only pulled on the
// nodejs runtime). It is ON BY DEFAULT — there is NO env flag gating it. A fresh
// install runs these jobs with zero config.
//
// IMPORTANT (avoiding the Cairn CFG-3 mistake): do NOT add an env var to enable
// this. The brief's contract is zero-config. `start()` is idempotent so HMR /
// double-registration never spins up a second interval.

// How often the interval fires to check for due jobs. The jobs themselves run on
// their own (much longer) cadences; this is just the polling granularity.
const TICK_INTERVAL_MS = 60_000 // 60s

const DAY_MS = 24 * 60 * 60 * 1000

// HMR-safe singleton: cache on globalThis so Next's dev module re-imports reuse
// the same Scheduler + interval instead of leaking new ones each reload.
const globalForScheduler = globalThis as unknown as {
  __scheduler?: SchedulerSingleton
}

class SchedulerSingleton {
  private readonly core = new Scheduler()
  private timer: ReturnType<typeof setInterval> | null = null
  private started = false
  private registered = false
  // True while a `core.tick()` is still resolving. The interval callback is
  // fire-and-forget (it can't await), so without this guard a tick that runs
  // longer than TICK_INTERVAL_MS would let the next interval fire a second,
  // overlapping tick. The per-job lock in the core already prevents re-entering
  // an individual job; this prevents whole ticks from piling up.
  private ticking = false

  /**
   * Register the default jobs (once) and start the single polling interval.
   * IDEMPOTENT: a second call while already started is a no-op — it never
   * creates a duplicate timer. Safe to call from `register()` across HMR.
   */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    this.registerDefaults()

    // DB-config awareness: registerDefaults() only sees the env-based S3 toggle
    // (sync). At boot, additionally consult the DB-backed config (env OR DB) so a
    // UI-configured S3 backup is registered without a restart. Best-effort — a
    // config-read failure must never block boot.
    try {
      if (await isS3Active()) this.reconfigureS3Job(true)
    } catch {
      // ignore — the job can still be live-registered later via the settings UI
    }

    // Kick a tick on the next macrotask so a due-on-boot job runs shortly after
    // start without blocking the server boot path.
    setTimeout(() => void this.tick(), 0)

    this.timer = setInterval(() => {
      void this.tick()
    }, TICK_INTERVAL_MS)
    // Don't keep the process alive solely for the scheduler (clean test/CLI exit).
    this.timer.unref?.()
  }

  /**
   * Live add/remove the 's3-backup' job without a restart (called after the
   * settings UI saves the S3 config). Idempotent: registering when already
   * present is a no-op; disabling when absent is a no-op. The job runs on the
   * same 24h cadence as the env-configured path.
   */
  reconfigureS3Job(enabled: boolean): void {
    this.registerDefaults()
    if (enabled) {
      if (!this.core.has('s3-backup')) {
        this.core.register({ name: 's3-backup', intervalMs: DAY_MS, run: s3BackupJob })
      }
    } else if (this.core.has('s3-backup')) {
      this.core.unregister('s3-backup')
    }
  }

  /**
   * Run one polling tick, guarded so overlapping interval fires never pile up.
   * If a previous tick is still resolving (a slow job is mid-run), this fire is
   * dropped — the still-pending tick will pick up anything that came due. Never
   * throws (core.tick swallows job errors; the guard is always released).
   */
  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      await this.core.tick(Date.now())
    } finally {
      this.ticking = false
    }
  }

  /** Stop the interval and reset the started guard (cleanup / tests). */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.started = false
  }

  /** Snapshot of every job's state for the admin page / API. */
  getState(): JobState[] {
    this.registerDefaults()
    return this.core.getState()
  }

  /** Manually trigger one job now. Returns false for an unknown job name. */
  async runNow(name: string): Promise<boolean> {
    this.registerDefaults()
    return this.core.runNow(name, Date.now())
  }

  /** Register the real default jobs exactly once (lazily, idempotent). */
  private registerDefaults(): void {
    if (this.registered) return
    this.registered = true

    // Real, zero-config job: enforce each owner's trash-retention window by
    // permanently purging trashed docs older than their retention. Resilient —
    // one owner failing does not abort the rest of the sweep.
    this.core.register({
      name: 'trash-purge',
      intervalMs: DAY_MS,
      run: trashPurgeJob,
    })

    // Real, harmless job: a heartbeat that confirms the DB is reachable from the
    // scheduler's runtime. Cheap (a single trivial query) and proves the
    // scheduler is alive on the admin page.
    this.core.register({
      name: 'db-heartbeat',
      intervalMs: 5 * 60_000, // 5 min
      run: heartbeatJob,
    })

    // OFF-UNLESS-CONFIGURED (E9 / Cairn CFG-2): the scheduled S3 backup job is
    // registered ONLY when S3 is configured via env. An unconfigured install has
    // no 's3-backup' job at all — its getState() shows only trash-purge and
    // db-heartbeat, and the @aws-sdk SDK is never loaded. There is deliberately
    // NO env flag toggling an already-registered job (that would be CFG-3).
    if (isS3Configured()) {
      this.core.register({
        name: 's3-backup',
        intervalMs: DAY_MS, // 24h
        run: s3BackupJob,
      })
    }
  }
}

/** Purge expired trash for every owner, isolating per-owner failures. */
async function trashPurgeJob(): Promise<void> {
  const owners = await db.select({ id: schema.users.id }).from(schema.users)
  for (const owner of owners) {
    try {
      const retentionDays = await getTrashRetentionDays(owner.id)
      await purgeExpiredTrash(owner.id, retentionDays)
    } catch (err) {
      // One owner's failure must not abort the sweep for the others.
      console.error(`[scheduler] trash-purge failed for owner ${owner.id}:`, err)
    }
  }
}

/** Cheap liveness check: confirm the DB answers a trivial query. */
async function heartbeatJob(): Promise<void> {
  await db.select({ id: schema.users.id }).from(schema.users).limit(1)
}

/**
 * Scheduled S3 backup: for every owner, build a lossless workspace backup and
 * upload it to the configured S3-compatible bucket. Per-owner failures are
 * collected and re-thrown as a single error so the job's lastStatus is 'error'
 * (the core records it and never crashes the scheduler). The secret is never
 * logged — only the owner id + a sanitized message.
 */
async function s3BackupJob(): Promise<void> {
  const owners = await db.select({ id: schema.users.id }).from(schema.users)
  const failures: string[] = []
  for (const owner of owners) {
    try {
      const createdAt = new Date().toISOString()
      const bytes = await createWorkspaceBackup(owner.id, createdAt)
      const key = `parchment-backup-${owner.id}-${createdAt}.zip`
      await uploadToS3(key, bytes)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[scheduler] s3-backup failed for owner ${owner.id}:`, msg)
      failures.push(`${owner.id}: ${msg}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`s3-backup failed for ${failures.length} owner(s): ${failures.join('; ')}`)
  }
}

/** The process-wide scheduler singleton (cached on globalThis for HMR safety). */
export const scheduler: SchedulerSingleton =
  globalForScheduler.__scheduler ?? new SchedulerSingleton()

if (process.env.NODE_ENV !== 'production') globalForScheduler.__scheduler = scheduler
