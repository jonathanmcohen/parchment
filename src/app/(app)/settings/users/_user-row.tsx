'use client'
import { useActionState, useTransition } from 'react'
import { canAssignRole, type Role, WORKSPACE_ROLES } from '@/lib/auth/roles'
import type { UserListItem } from '@/lib/auth/users-repo'
import { deleteUserAction, setUserDisabledAction, setUserRoleAction } from './actions'

type Props = {
  user: UserListItem
  actorRole: string
  isSelf: boolean
  isLastOwner: boolean
}

export function UserRow({ user, actorRole, isSelf, isLastOwner }: Props) {
  const [roleState, roleAction, rolePending] = useActionState(setUserRoleAction, null)
  const [disState, disAction, disPending] = useActionState(setUserDisabledAction, null)
  const [delState, delAction, delPending] = useActionState(deleteUserAction, null)
  const [, startTransition] = useTransition()
  const assignableRoles = WORKSPACE_ROLES.filter(
    (r) => r !== 'owner' && canAssignRole({ role: actorRole }, r as Role),
  )

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData()
    fd.set('userId', user.id)
    fd.set('role', e.target.value)
    startTransition(() => roleAction(fd))
  }

  function handleToggleDisabled() {
    const fd = new FormData()
    fd.set('userId', user.id)
    fd.set('disabled', user.disabledAt ? 'false' : 'true')
    startTransition(() => disAction(fd))
  }

  function handleDelete() {
    const fd = new FormData()
    fd.set('userId', user.id)
    startTransition(() => delAction(fd))
  }

  const canDelete = !isSelf && !isLastOwner
  const canDisable = !isSelf && !isLastOwner

  return (
    <li
      data-testid="user-row"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] px-4 py-3 text-sm"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{user.name}</span>
        <span className="text-[var(--muted)]">{user.email}</span>
        {user.disabledAt && <span className="text-[var(--warning)] text-xs">Disabled</span>}
      </div>
      <div className="flex items-center gap-2">
        {assignableRoles.length > 0 ? (
          <select
            aria-label="Role"
            defaultValue={user.role}
            onChange={handleRoleChange}
            disabled={rolePending || isLastOwner}
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
          >
            {user.role === 'owner' && <option value="owner">owner</option>}
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] text-xs">
            {user.role}
          </span>
        )}
        <button
          type="button"
          onClick={handleToggleDisabled}
          disabled={!canDisable || disPending}
          className="rounded px-2 py-1 text-[var(--muted)] text-xs hover:text-[var(--foreground)] disabled:opacity-40"
        >
          {user.disabledAt ? 'Enable' : 'Disable'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={!canDelete || delPending}
          className="rounded px-2 py-1 text-[var(--error)] text-xs hover:opacity-80 disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      {(roleState?.error || disState?.error || delState?.error) && (
        <p className="mt-1 w-full text-[var(--error)] text-xs" role="alert">
          {roleState?.error ?? disState?.error ?? delState?.error}
        </p>
      )}
    </li>
  )
}
