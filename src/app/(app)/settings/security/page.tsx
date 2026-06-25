import { PasswordChangeForm } from '@/components/settings/PasswordChangeForm'
import { SessionsList } from '@/components/settings/SessionsList'
import { MfaSection } from './mfa-section'

export default function SecuritySettingsPage() {
  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Security</h1>
      <p className="mt-2 text-[var(--muted)]">
        Protect your account with a strong password and additional factors.
      </p>

      <section aria-labelledby="security-password" className="mt-10">
        <h2 id="security-password" className="font-medium text-lg">
          Password
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Update the password used to sign in to your account.
        </p>
        <PasswordChangeForm />
      </section>

      <section
        aria-labelledby="security-mfa"
        className="mt-12 border-t border-[var(--border)] pt-8"
      >
        <h2 id="security-mfa" className="font-medium text-lg">
          Two-factor authentication
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Add an authenticator app or a passkey for a second layer of protection.
        </p>
        <MfaSection />
      </section>

      <section
        aria-labelledby="security-sessions"
        className="mt-12 border-t border-[var(--border)] pt-8"
      >
        <h2 id="security-sessions" className="font-medium text-lg">
          Sessions
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Review the sessions currently signed in to your account.
        </p>
        <SessionsList />
      </section>
    </section>
  )
}
