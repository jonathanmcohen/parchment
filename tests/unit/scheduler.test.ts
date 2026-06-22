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
