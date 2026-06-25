import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { AccountNameSetting } from '@/components/settings/AccountNameSetting'
import { AccountThemeSelect } from '@/components/settings/AccountThemeSelect'
import { requireUser } from '@/lib/auth/guard'

// CF6: this is an async server component. `requireUser()` resolves the live
// session user (the (app)/layout.tsx already gates the group, redirecting
// logged-out visitors to /login), so the Profile inputs can be pre-populated
// with the user's real name + email via defaultValue. Without `async`, the
// page can't `await requireUser()` and the inputs render empty.
export default async function AccountSettingsPage() {
  const user = await requireUser()

  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Account</h1>
      <p className="mt-2 text-[var(--muted)]">
        Manage your personal profile, appearance, and language preferences.
      </p>

      <section aria-labelledby="account-profile" className="mt-8">
        <h2 id="account-profile" className="font-medium text-lg">
          Profile
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Your name and email as they appear to collaborators.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <AccountNameSetting initialName={user.name ?? ''} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-email" className="font-medium text-sm">
              Email
            </label>
            {/* V2: email is the login identity and there is no verification flow
                yet, so it is read-only for now (the dead editable input silently
                lost edits). Display name + Language below are now persisted. */}
            <input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={user.email}
              disabled
              readOnly
              className="cursor-not-allowed rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm opacity-60"
            />
            <p className="text-[var(--muted)] text-xs">Email changes aren’t available yet.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="account-theme" className="mt-8">
        <h2 id="account-theme" className="font-medium text-lg">
          Theme
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Choose how Parchment looks. Matches your system by default (Plan I1).
        </p>
        <AccountThemeSelect />
      </section>

      <section aria-labelledby="account-language" className="mt-8">
        <h2 id="account-language" className="font-medium text-lg">
          Language
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          The display language for menus, labels, and messages.
        </p>
        {/* V2: reuse the canonical LocaleSwitcher (useLocale + setLocale server
            action + router.refresh) instead of the previous dead <select> that
            had no onChange and hard-coded "en". One locale control, one code
            path — the same one the Workspace page uses. */}
        <div className="mt-4">
          <LocaleSwitcher />
        </div>
      </section>
    </section>
  )
}
