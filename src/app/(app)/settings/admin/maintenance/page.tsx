import { requireAdmin } from '@/lib/auth/guard'
import { isMaintenanceMode } from '@/lib/maintenance'
import { toggleMaintenance } from './actions'

/**
 * Admin maintenance mode toggle (I6-T4).
 * Requires admin role. Shows current status and a toggle button.
 */
export default async function MaintenancePage() {
  await requireAdmin()
  const active = await isMaintenanceMode()

  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Maintenance mode</h1>
      <p className="mt-2 text-[var(--muted)]">
        While maintenance mode is enabled, all write operations are blocked. Reads remain
        available. Health and setup routes are never blocked.
      </p>

      <div className="mt-8 flex items-center gap-4">
        <span
          data-testid="maintenance-status"
          className={`inline-flex items-center rounded-full px-3 py-1 font-medium text-sm ${
            active
              ? 'bg-amber-100 text-amber-800'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {active ? 'ON — writes blocked' : 'OFF — normal operation'}
        </span>
      </div>

      <form
        className="mt-6"
        action={async () => {
          'use server'
          await toggleMaintenance(!active)
        }}
      >
        <button
          type="submit"
          className={`rounded-md px-4 py-2 font-medium text-sm text-white ${
            active
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-amber-600 hover:bg-amber-700'
          }`}
        >
          {active ? 'Disable maintenance mode' : 'Enable maintenance mode'}
        </button>
      </form>
    </section>
  )
}
