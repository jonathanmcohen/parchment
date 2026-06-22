// I10 — the PURE, timer-free core of the in-process scheduler.
//
// This module holds the data types, the pure next-run computation, and a
// `Scheduler` class whose advancement is driven entirely by an injected clock
// and a `tick(nowMs)` method. It contains NO `setInterval`, NO `@/db`, and NO
// real time — so it is fully unit-testable: register a fake job, advance the
// clock by hand, and assert on state. The module-singleton + real timer + real
// DB-backed jobs live in `./scheduler.ts`, which composes this core.

/** Observable, serializable per-job state (what the admin page + API render). */
export interface JobState {
  name: string
  intervalMs: number
  lastRunAt: number | null
  nextRunAt: number | null
  lastStatus: 'never' | 'ok' | 'error'
  lastError?: string
  runCount: number
  lastDurationMs?: number
}

/** A registered job: a name, a cadence, and an async unit of work. */
export interface ScheduledJob {
  name: string
  intervalMs: number
  run: () => Promise<void>
}

/** Compute the next run time from now + interval (pure). */
export function computeNextRun(nowMs: number, intervalMs: number): number {
  return nowMs + intervalMs
}

/**
 * The pure scheduler core. Holds the job list and per-job state. Advancement is
 * driven by `tick(nowMs)` (run all due jobs) — there are no timers here, so a
 * test can register a fake job, call `tick` with a hand-rolled clock, and assert
 * the job ran exactly once per interval. A throw inside one job is caught and
 * recorded as `lastStatus: 'error'`; it never aborts the tick or other jobs and
 * never propagates out of `tick`/`runNow`.
 */
export class Scheduler {
  private readonly jobs = new Map<string, ScheduledJob>()
  private readonly state = new Map<string, JobState>()

  /** Register a job and seed its 'never'-run state. Replaces a same-named job. */
  register(job: ScheduledJob): void {
    this.jobs.set(job.name, job)
    this.state.set(job.name, {
      name: job.name,
      intervalMs: job.intervalMs,
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: 'never',
      runCount: 0,
    })
  }

  /** True if a job with this name is registered. */
  has(name: string): boolean {
    return this.jobs.has(name)
  }

  /** Snapshot of every job's state (stable order = registration order). */
  getState(): JobState[] {
    return [...this.state.values()].map((s) => ({ ...s }))
  }

  /**
   * Run every job whose nextRunAt is due (null = due immediately on first tick).
   * Each job is awaited and wrapped so one failure never aborts the others.
   * Never throws.
   */
  async tick(nowMs: number): Promise<void> {
    for (const job of this.jobs.values()) {
      const s = this.state.get(job.name)
      if (!s) continue
      const due = s.nextRunAt === null || nowMs >= s.nextRunAt
      if (due) await this.execute(job, nowMs)
    }
  }

  /**
   * Manually run one job now, regardless of its schedule. Updates state and
   * re-bases the next run off `nowMs`. Returns false if the job is unknown.
   * Never throws.
   */
  async runNow(name: string, nowMs: number): Promise<boolean> {
    const job = this.jobs.get(name)
    if (!job) return false
    await this.execute(job, nowMs)
    return true
  }

  /** Run one job, timing it and recording the outcome. Swallows job throws. */
  private async execute(job: ScheduledJob, nowMs: number): Promise<void> {
    const prev = this.state.get(job.name)
    const runCount = (prev?.runCount ?? 0) + 1
    const startedAt = nowMs
    const base: JobState = {
      name: job.name,
      intervalMs: job.intervalMs,
      lastRunAt: startedAt,
      nextRunAt: computeNextRun(startedAt, job.intervalMs),
      lastStatus: 'ok',
      runCount,
    }
    try {
      await job.run()
      base.lastDurationMs = Math.max(0, this.now() - startedAt)
      this.state.set(job.name, base)
    } catch (err) {
      base.lastDurationMs = Math.max(0, this.now() - startedAt)
      base.lastStatus = 'error'
      base.lastError = err instanceof Error ? err.message : String(err)
      this.state.set(job.name, base)
    }
  }

  /**
   * Wall-clock used only to measure a job's duration. Overridable so a test can
   * make durations deterministic; the scheduling decisions themselves never read
   * this — they use the `nowMs` passed into `tick`/`runNow`.
   */
  protected now(): number {
    return Date.now()
  }
}
