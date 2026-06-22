import { describe, expect, it } from 'vitest'
import { computeNextRun, type ScheduledJob, Scheduler } from '@/lib/schedules/jobs'

// I10 — the scheduler CORE is pure and timer-free: every test drives it with a
// hand-rolled clock via tick(nowMs)/runNow(name, nowMs). No real setInterval.

describe('I10 — computeNextRun', () => {
  it('returns now + interval', () => {
    expect(computeNextRun(1_000, 500)).toBe(1_500)
    expect(computeNextRun(0, 60_000)).toBe(60_000)
    expect(computeNextRun(10, 0)).toBe(10)
  })
})

function makeJob(name: string, intervalMs: number, run: () => Promise<void>): ScheduledJob {
  return { name, intervalMs, run }
}

// A manually-resolvable promise, used to park a job "in-flight" so a concurrent
// tick/runNow can be observed not to re-enter it.
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('I10 — Scheduler core (tick-driven)', () => {
  it('seeds a registered job as never-run', () => {
    const s = new Scheduler()
    s.register(makeJob('a', 1000, async () => {}))
    const [state] = s.getState()
    expect(state).toMatchObject({
      name: 'a',
      intervalMs: 1000,
      lastRunAt: null,
      nextRunAt: null,
      lastStatus: 'never',
      runCount: 0,
    })
  })

  it('runs a due job on the first tick and schedules the next run', async () => {
    const s = new Scheduler()
    let runs = 0
    s.register(makeJob('a', 1000, async () => void runs++))

    await s.tick(0)

    expect(runs).toBe(1)
    const [state] = s.getState()
    expect(state?.runCount).toBe(1)
    expect(state?.lastStatus).toBe('ok')
    expect(state?.lastRunAt).toBe(0)
    expect(state?.nextRunAt).toBe(1000) // now + interval
  })

  it('runs once per interval as the clock advances (not on every tick)', async () => {
    const s = new Scheduler()
    let runs = 0
    s.register(makeJob('a', 1000, async () => void runs++))

    await s.tick(0) // due (first run)
    await s.tick(500) // not due yet
    await s.tick(999) // not due yet
    await s.tick(1000) // due again
    await s.tick(1500) // not due yet
    await s.tick(2000) // due again

    expect(runs).toBe(3)
    const [state] = s.getState()
    expect(state?.runCount).toBe(3)
    expect(state?.nextRunAt).toBe(3000)
  })

  it('records a throwing job as error without stopping other jobs or throwing', async () => {
    const s = new Scheduler()
    let goodRuns = 0
    s.register(makeJob('bad', 1000, async () => Promise.reject(new Error('boom'))))
    s.register(makeJob('good', 1000, async () => void goodRuns++))

    await expect(s.tick(0)).resolves.toBeUndefined()

    expect(goodRuns).toBe(1) // the good job still ran
    const bad = s.getState().find((j) => j.name === 'bad')
    const good = s.getState().find((j) => j.name === 'good')
    expect(bad?.lastStatus).toBe('error')
    expect(bad?.lastError).toBe('boom')
    expect(bad?.runCount).toBe(1)
    expect(good?.lastStatus).toBe('ok')
  })

  it('runNow runs a known job immediately and returns true; unknown returns false', async () => {
    const s = new Scheduler()
    let runs = 0
    s.register(makeJob('a', 60_000, async () => void runs++))

    const ranKnown = await s.runNow('a', 12_345)
    const ranUnknown = await s.runNow('nope', 12_345)

    expect(ranKnown).toBe(true)
    expect(ranUnknown).toBe(false)
    expect(runs).toBe(1)
    const [state] = s.getState()
    expect(state?.runCount).toBe(1)
    expect(state?.lastRunAt).toBe(12_345)
    expect(state?.nextRunAt).toBe(72_345)
  })

  it('does not re-enter a slow in-flight job when a later tick fires (no pile-up)', async () => {
    const s = new Scheduler()
    let active = 0
    let maxConcurrent = 0
    let starts = 0
    let gate = deferred()

    s.register(
      makeJob('slow', 1000, async () => {
        starts++
        active++
        maxConcurrent = Math.max(maxConcurrent, active)
        // Block until the test releases this run, simulating a long sweep that
        // outlives the next interval fire.
        await gate.promise
        active--
      }),
    )

    // tick #1: due (first run) — starts the slow job and parks it in-flight.
    const tick1 = s.tick(0)
    await Promise.resolve() // let execute() reach the awaited run()
    expect(starts).toBe(1)

    // tick #2 fires while #1 is still in-flight. The stale state still has the
    // old nextRunAt, so without the guard it would re-evaluate as due and start
    // a SECOND concurrent run. It must be skipped instead.
    await s.tick(60_000)
    expect(starts).toBe(1) // not re-entered
    expect(maxConcurrent).toBe(1)

    // Release the first run; it completes and records its state.
    gate.resolve()
    await tick1

    const [state] = s.getState()
    expect(state?.runCount).toBe(1)
    expect(state?.lastStatus).toBe('ok')

    // A later tick after completion runs it again normally.
    gate = deferred()
    const tick3 = s.tick(120_000)
    await Promise.resolve()
    gate.resolve()
    await tick3
    expect(starts).toBe(2)
    expect(s.getState()[0]?.runCount).toBe(2)
  })

  it('runNow does not start a second concurrent run while one is in-flight', async () => {
    const s = new Scheduler()
    let starts = 0
    const gate = deferred()
    s.register(
      makeJob('busy', 60_000, async () => {
        starts++
        await gate.promise
      }),
    )

    const first = s.runNow('busy', 0)
    await Promise.resolve()
    expect(starts).toBe(1)

    // A second runNow (e.g. a rapid double-click) while the first is in-flight
    // is a no-op for execution, but the job is known so it still resolves true.
    const second = await s.runNow('busy', 0)
    expect(second).toBe(true)
    expect(starts).toBe(1) // not re-entered

    gate.resolve()
    await first
    expect(s.getState()[0]?.runCount).toBe(1) // exactly one run recorded
  })

  it('measures lastDurationMs from the wall clock, not the injected scheduling clock', async () => {
    // A test Scheduler with a controllable wall clock. The scheduling clock
    // (nowMs passed to tick) is a huge synthetic value; duration must NOT mix it.
    class TestScheduler extends Scheduler {
      public wall = 1000
      protected override now(): number {
        return this.wall
      }
    }
    const s = new TestScheduler()
    s.register(
      makeJob('timed', 1000, async () => {
        s.wall += 250 // 250ms of real time elapses during the run
      }),
    )

    await s.tick(1_700_000_000_000) // a Date.now()-scale scheduling clock

    const [state] = s.getState()
    expect(state?.lastDurationMs).toBe(250) // wall delta, not ~1.7e12
    expect(state?.lastRunAt).toBe(1_700_000_000_000) // scheduling clock
  })

  it('increments runCount across multiple runs and recovers status from error to ok', async () => {
    const s = new Scheduler()
    let fail = true
    s.register(
      makeJob('flaky', 1000, async () => {
        if (fail) throw new Error('first time fails')
      }),
    )

    await s.tick(0) // errors
    expect(s.getState()[0]?.lastStatus).toBe('error')
    expect(s.getState()[0]?.runCount).toBe(1)

    fail = false
    await s.tick(1000) // ok now
    const [state] = s.getState()
    expect(state?.lastStatus).toBe('ok')
    expect(state?.lastError).toBeUndefined()
    expect(state?.runCount).toBe(2)
  })
})
