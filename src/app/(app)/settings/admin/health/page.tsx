import { HealthPills } from '@/components/health/HealthPills'
import { probeAll } from '@/lib/health/probes'

export const dynamic = 'force-dynamic'

export default async function HealthPage() {
  const pills = await probeAll()
  const ok = pills.every((p) => p.status !== 'down')

  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Health</h1>
      <p className="mt-2 text-[var(--muted)]">
        Live status of core services. {ok ? 'All systems operational.' : 'Some services are down.'}
      </p>
      <div className="mt-6">
        <HealthPills pills={pills} />
      </div>
    </section>
  )
}
