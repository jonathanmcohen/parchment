import { RunNowButton } from '@/components/schedules/RunNowButton'
import type { JobState } from '@/lib/schedules/jobs'
import { scheduler } from '@/lib/schedules/scheduler'

export const dynamic = 'force-dynamic'

// I10 — Schedules admin page. Server component: reads the live scheduler state
// from THIS process (the same process Next's instrumentation booted it in) and
// renders it as an accessible table. Each row has a "Run now" client island.

// AA-contrast status colors against light paper (mirrors HealthPills).
const STATUS_COLOR: Record<JobState['lastStatus'], string> = {
  never: 'var(--muted)',
  ok: '#16803d', // green-700
  error: '#b91c1c', // red-700
}
const STATUS_LABEL: Record<JobState['lastStatus'], string> = {
  never: 'Never run',
  ok: 'OK',
  error: 'Error',
}

/** Humanize an interval in ms: "5 min", "1 hour", "24 hours", "7 days". */
function humanizeInterval(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** Relative time vs now: "just now", "3 min ago", "in 2 hours". null → "—". */
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

function StatusPill({ status }: { status: JobState['lastStatus'] }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_COLOR[status] }}
      />
      <span style={{ color: STATUS_COLOR[status] }} className="text-sm">
        {STATUS_LABEL[status]}
      </span>
    </span>
  )
}

export default function SchedulesPage() {
  const jobs = scheduler.getState()
  const now = Date.now()

  return (
    <section className="max-w-4xl">
      <h1 className="font-semibold text-2xl tracking-tight">Schedules</h1>
      <p className="mt-2 text-[var(--muted)]">
        Recurring background jobs. Enabled by default — no configuration required. Last run, status,
        and next run reflect this server process.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Scheduled background jobs and their status</caption>
          <thead>
            <tr className="border-[var(--border)] border-b text-left text-[var(--muted)]">
              <th scope="col" className="py-2 pr-4 font-medium">
                Job
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Interval
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Last run
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Next run
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Runs
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-[var(--muted)]">
                  No scheduled jobs registered.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.name} className="border-[var(--border)] border-b">
                  <th scope="row" className="py-3 pr-4 text-left font-mono font-normal">
                    {job.name}
                  </th>
                  <td className="py-3 pr-4 text-[var(--muted)]">
                    {humanizeInterval(job.intervalMs)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted)]">
                    {relativeTime(job.lastRunAt, now)}
                    {job.lastError ? (
                      <span
                        className="mt-0.5 block break-words text-xs"
                        style={{ color: '#b91c1c' }}
                      >
                        {job.lastError}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill status={job.lastStatus} />
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted)]">
                    {relativeTime(job.nextRunAt, now)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--muted)] tabular-nums">{job.runCount}</td>
                  <td className="py-3">
                    <RunNowButton name={job.name} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
