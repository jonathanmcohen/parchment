import { requireAdmin } from '@/lib/auth/guard'
import { listInvites } from '@/lib/auth/invites-repo'
import { listUsers } from '@/lib/auth/users-repo'
import { CreateInviteForms } from './_create-invite-forms'
import { UserRow } from './_user-row'

export const dynamic = 'force-dynamic'

export default async function UsersSettingsPage() {
  const me = await requireAdmin() // non-admins redirected to '/'
  const [users, invites] = await Promise.all([listUsers(), listInvites()])
  const ownerCount = users.filter((u) => u.role === 'owner').length

  return (
    <section className="max-w-3xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Users</h1>
      <p className="mt-2 text-[var(--muted)]">
        Invite people, manage roles, and control account access.
      </p>

      <CreateInviteForms actorRole={me.role} />

      <h2 className="mt-10 font-medium text-lg">People</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            actorRole={me.role}
            isSelf={u.id === me.id}
            isLastOwner={u.role === 'owner' && ownerCount === 1}
          />
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-lg">Pending invites</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                data-testid="invite-row"
                className="rounded-md border border-[var(--border)] px-4 py-3 text-sm"
              >
                {inv.email} — {inv.role} — expires {inv.expiresAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
