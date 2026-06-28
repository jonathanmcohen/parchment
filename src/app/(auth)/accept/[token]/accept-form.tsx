'use client'

import { useActionState } from 'react'
import { type AcceptState, acceptInviteAction } from './actions'

const initialState: AcceptState = null

// Thin client form mirroring login-form.tsx: a hidden token, a name field, and a
// password field, submitted through the acceptInviteAction Server Action. On
// success the action redirects to '/'; on failure it returns { error }.
export function AcceptForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, initialState)

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="accept-email" className="font-medium text-sm">
          Email
        </label>
        <input
          id="accept-email"
          type="email"
          value={email}
          disabled
          readOnly
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--muted)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="accept-name" className="font-medium text-sm">
          Your name
        </label>
        <input
          id="accept-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="accept-password" className="font-medium text-sm">
          Choose a password
        </label>
        <input
          id="accept-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </div>

      {state && 'error' in state ? (
        <p role="alert" className="text-[var(--error)] text-sm">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--primary)] px-4 py-2 font-medium text-[var(--on-primary)] disabled:opacity-60"
      >
        {pending ? 'Setting up…' : 'Set up your account'}
      </button>
    </form>
  )
}
