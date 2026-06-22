import { db, schema } from '@/db'
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

  /**
   * Register the default jobs (once) and start the single polling interval.
   * IDEMPOTENT: a second call while already started is a no-op — it never
   * creates a duplicate timer. Safe to call from `register()` across HMR.
   */
  start(): void {
    if (this.started) return
    this.started = true

    this.registerDefaults()

    // Kick a tick on the next macrotask so a due-on-boot job runs shortly after
    // start without blocking the server boot path.
    setTimeout(() => void this.core.tick(Date.now()), 0)

    this.timer = setInterval(() => {
      void this.core.tick(Date.now())
    }, TICK_INTERVAL_MS)
    // Don't keep the process alive solely for the scheduler (clean test/CLI exit).
    this.timer.unref?.()
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

/** The process-wide scheduler singleton (cached on globalThis for HMR safety). */
export const scheduler: SchedulerSingleton =
  globalForScheduler.__scheduler ?? new SchedulerSingleton()

if (process.env.NODE_ENV !== 'production') globalForScheduler.__scheduler = scheduler
