import { redirect } from 'next/navigation'

// backup-sync (N-T1): the Backup page was promoted to the top-level
// /settings/backup. This route stays so deep-links redirect cleanly.
export const dynamic = 'force-dynamic'

export default function AdminBackupRedirect() {
  redirect('/settings/backup')
}
