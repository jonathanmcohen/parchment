import { redirect } from 'next/navigation'
import { ownerExists } from '@/lib/auth/bootstrap'
import { getCurrentUser } from '@/lib/auth/session'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // Fresh instance with no owner yet → send to first-run setup.
  if (!(await ownerExists())) redirect('/setup')
  // Already signed in → nothing to do here.
  if (await getCurrentUser()) redirect('/')

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
        <LoginForm />
      </div>
    </main>
  )
}
