'use client'
import { useActionState, useState } from 'react'
import { canAssignRole, type Role, WORKSPACE_ROLES } from '@/lib/auth/roles'
import { type ActionState, createUserAction, type InviteState, inviteUserAction } from './actions'

type Props = { actorRole: string }

export function CreateInviteForms({ actorRole }: Props) {
  const assignableRoles = WORKSPACE_ROLES.filter(
    (r) => r !== 'owner' && canAssignRole({ role: actorRole }, r as Role),
  )
  const [showInvite, setShowInvite] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [inviteState, inviteAction, invitePending] = useActionState<InviteState, FormData>(
    inviteUserAction,
    null,
  )
  const [createState, createAction, createPending] = useActionState<ActionState, FormData>(
    createUserAction,
    null,
  )

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setShowInvite((v) => !v)
            setShowCreate(false)
          }}
          className="rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] text-sm hover:bg-[var(--primary-hover)]"
        >
          Invite by email
        </button>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v)
            setShowInvite(false)
          }}
          className="rounded-md border border-[var(--border)] px-4 py-2 font-medium text-sm hover:bg-[var(--surface-hover)]"
        >
          Create directly
        </button>
      </div>

      {showInvite && (
        <form
          action={inviteAction}
          className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-4"
        >
          <h3 className="font-medium text-sm">Invite by email</h3>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              aria-label="Email"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select
              name="role"
              defaultValue="editor"
              aria-label="Role"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {inviteState && 'error' in inviteState && (
            <p className="text-[var(--error)] text-sm" role="alert">
              {inviteState.error}
            </p>
          )}
          {inviteState && 'acceptUrl' in inviteState && (
            <div className="flex items-center gap-2 rounded-md bg-[var(--surface-muted)] px-3 py-2 text-xs">
              <span className="truncate font-mono">{inviteState.acceptUrl}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(inviteState.acceptUrl)}
                className="shrink-0 rounded px-2 py-1 text-xs hover:bg-[var(--surface-hover)]"
              >
                Copy
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={invitePending}
            className="self-start rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] text-sm disabled:opacity-50"
          >
            {invitePending ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}

      {showCreate && (
        <form
          action={createAction}
          className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-4"
        >
          <h3 className="font-medium text-sm">Create user directly</h3>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              required
              aria-label="Email"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              name="name"
              type="text"
              required
              aria-label="Name"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select
              name="role"
              defaultValue="editor"
              aria-label="Role"
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {createState?.error && (
            <p className="text-[var(--error)] text-sm" role="alert">
              {createState.error}
            </p>
          )}
          <button
            type="submit"
            disabled={createPending}
            className="self-start rounded-md bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] text-sm disabled:opacity-50"
          >
            {createPending ? 'Creating…' : 'Create user'}
          </button>
        </form>
      )}
    </div>
  )
}
