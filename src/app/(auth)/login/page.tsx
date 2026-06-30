import { redirect } from 'next/navigation'
import { ownerExists } from '@/lib/auth/bootstrap'
import { isOidcEnabled } from '@/lib/auth/oidc-config'
import { getCurrentUser } from '@/lib/auth/session'
import { ssoErrorMessage } from '@/lib/auth/sso-error'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. The SSO start/callback routes redirect here
  // with ?sso=<code>[&reason=<reason>] on failure (v0.2.4 #3b).
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Fresh instance with no owner yet → send to first-run setup.
  if (!(await ownerExists())) redirect('/setup')
  // Already signed in → nothing to do here.
  if (await getCurrentUser()) redirect('/')

  // Show the SSO button only when OIDC is configured + enabled. We pass a BOOLEAN —
  // the OIDC config (incl. the client secret) never reaches the client.
  const ssoEnabled = await isOidcEnabled()

  // v0.2.4 #3b: turn an opaque ?sso=denied into an actionable message on the page.
  const sp = await searchParams
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const ssoError = ssoErrorMessage(first(sp.sso), first(sp.reason))

  return (
    // S5-13: Docs sign-in framing — a white --surface card with --border-chrome,
    // 8px radius and --shadow-page elevation, centered on the page. The heading
    // reads in the UI face (Google Sans → Roboto). The submit button + inputs
    // adopt the fixed brand tokens in login-form.tsx.
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16"
    >
      <div className="flex flex-col gap-6 rounded-lg border border-[var(--border-chrome)] bg-[var(--surface)] p-8 shadow-[var(--shadow-page)]">
        <div className="flex flex-col gap-2">
          <h1 className="font-medium text-[24px] tracking-tight text-[var(--foreground)]">
            Sign in
          </h1>
          <p className="text-[var(--muted)] text-sm">Welcome back to Parchment.</p>
        </div>
        <LoginForm ssoEnabled={ssoEnabled} ssoError={ssoError} />
      </div>
    </main>
  )
}
