export default function AccountSettingsPage() {
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-name" className="font-medium text-sm">
              Display name
            </label>
            <input
              id="account-name"
              name="name"
              type="text"
              autoComplete="name"
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="account-email" className="font-medium text-sm">
              Email
            </label>
            <input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
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
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="account-theme-select" className="font-medium text-sm">
            Appearance
          </label>
          <select
            id="account-theme-select"
            name="theme"
            defaultValue="system"
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section aria-labelledby="account-language" className="mt-8">
        <h2 id="account-language" className="font-medium text-lg">
          Language
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          The display language for menus, labels, and messages.
        </p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="account-language-select" className="font-medium text-sm">
            Language
          </label>
          <select
            id="account-language-select"
            name="language"
            defaultValue="en"
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </section>
    </section>
  )
}
