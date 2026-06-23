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
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">Sign in</h1>
        <p className="text-[var(--muted)]">Welcome back to Parchment.</p>
      </div>
      <LoginForm />
    </main>
  )
}
