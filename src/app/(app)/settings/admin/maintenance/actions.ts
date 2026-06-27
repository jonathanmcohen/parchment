'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guard'
import { logAudit } from '@/lib/audit'
import { setMaintenanceMode } from '@/lib/maintenance'

/**
 * Server Action: toggle maintenance mode on or off.
 * Requires admin role. Logs the action to the audit trail.
 */
export async function toggleMaintenance(enabled: boolean): Promise<void> {
  const admin = await requireAdmin()
  await setMaintenanceMode(enabled, admin.id)
  await logAudit(enabled ? 'maintenance.enable' : 'maintenance.disable', {
    actorId: admin.id,
    targetType: 'system',
    targetId: 'maintenance',
  })
  revalidatePath('/settings/admin/maintenance')
}
