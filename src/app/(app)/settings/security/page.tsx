export default function SecuritySettingsPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Security</h1>
      <p className="mt-2 text-[var(--muted)]">
        Protect your account with a strong password and additional factors.
      </p>

      <section aria-labelledby="security-password" className="mt-8">
        <h2 id="security-password" className="font-medium text-lg">
          Password
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Update the password used to sign in to your account.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="security-current-password" className="font-medium text-sm">
              Current password
            </label>
            <input
              id="security-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="security-new-password" className="font-medium text-sm">
              New password
            </label>
            <input
              id="security-new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="security-mfa" className="mt-8">
        <h2 id="security-mfa" className="font-medium text-lg">
          Two-factor authentication
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Add an authenticator app or a passkey for a second layer of protection (Plan I7).
        </p>
      </section>

      <section aria-labelledby="security-sessions" className="mt-8">
        <h2 id="security-sessions" className="font-medium text-lg">
          Sessions
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Review the devices currently signed in and sign out the ones you do not recognize.
        </p>
      </section>
    </section>
  )
}
