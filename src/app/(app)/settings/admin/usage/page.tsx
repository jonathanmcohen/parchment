import { requireAdmin } from '@/lib/auth/guard'
import { formatBytes, getWorkspaceUsage } from '@/lib/admin/usage'

/**
 * Admin usage dashboard (I2-T8).
 * Shows per-user doc count, content size, asset storage, and quota.
 */
export default async function UsagePage() {
  await requireAdmin()
  const { users, dbSizeBytes, totalAssetBytes } = await getWorkspaceUsage()

  return (
    <section className="max-w-4xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Usage</h1>
      <p className="mt-2 text-[var(--muted)]">
        Per-user storage, document counts, and quota overview.
      </p>

      <div className="mt-4 flex gap-6 text-sm text-[var(--muted)]">
        <span>DB size: {formatBytes(dbSizeBytes)}</span>
        <span>Total assets: {formatBytes(totalAssetBytes)}</span>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table
          data-testid="usage-table"
          className="w-full border-collapse text-sm"
        >
          <thead>
            <tr className="border-b border-[var(--border)] text-left">
              <th className="py-2 pr-4 font-medium">User</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium text-right">Docs</th>
              <th className="py-2 pr-4 font-medium text-right">Content</th>
              <th className="py-2 pr-4 font-medium text-right">Assets</th>
              <th className="py-2 font-medium text-right">Quota</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]">
                <td className="py-2 pr-4">{u.name}</td>
                <td className="py-2 pr-4 text-[var(--muted)]">{u.email}</td>
                <td className="py-2 pr-4 text-right">{u.docCount}</td>
                <td className="py-2 pr-4 text-right">{formatBytes(u.contentSizeBytes)}</td>
                <td className="py-2 pr-4 text-right">{formatBytes(u.assetSizeBytes)}</td>
                <td className="py-2 text-right">
                  {u.quotaMb === 0 ? (
                    <span className="text-[var(--muted)]">Unlimited</span>
                  ) : (
                    `${u.quotaMb} MB`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
