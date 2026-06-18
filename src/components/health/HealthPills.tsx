import type { Pill, PillStatus } from '@/lib/health/probes'

// AA-contrast colors against light paper/background. The status label reuses the
// dot color (dark green/red on a light surface) — never white text on light.
const COLOR: Record<PillStatus, string> = {
  up: '#16803d', // green-700
  down: '#b91c1c', // red-700
  unknown: 'var(--muted)',
}

const LABEL: Record<PillStatus, string> = {
  up: 'Operational',
  down: 'Down',
  unknown: 'Unknown',
}

export function HealthPills({ pills }: { pills: Pill[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Service health">
      {pills.map((pill) => (
        <li
          key={pill.name}
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLOR[pill.status] }}
            />
            <span className="font-medium text-[var(--foreground)]">{pill.name}</span>
            <span role="status" className="ml-auto text-sm" style={{ color: COLOR[pill.status] }}>
              {LABEL[pill.status]}
            </span>
          </div>
          {pill.detail ? (
            <p className="mt-1 break-words pl-[1.625rem] text-[var(--muted)] text-xs">
              {pill.detail}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
