'use client'

import { useActionState } from 'react'
import { createOwner, type SetupState } from './actions'

const initialState: SetupState = null

export function SetupForm() {
  const [state, action, pending] = useActionState(createOwner, initialState)

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="font-medium text-sm">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-medium text-sm">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-medium text-sm">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
          className="rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2"
        />
        <span id="password-hint" className="text-[var(--muted)] text-sm">
          At least 8 characters.
        </span>
      </div>

      {state?.error ? (
        <p role="alert" className="text-[var(--accent)] text-sm">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[var(--accent-contrast)] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create owner account'}
      </button>
    </form>
  )
}
