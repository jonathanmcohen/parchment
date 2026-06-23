import { redirect } from 'next/navigation'
import { ownerExists } from '@/lib/auth/bootstrap'
import { SetupForm } from './setup-form'

export const dynamic = 'force-dynamic'

// First-run provisioning. Once an owner exists this route is closed.
export default async function SetupPage() {
  if (await ownerExists()) redirect('/login')

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-3xl tracking-tight">Welcome to Parchment</h1>
        <p className="text-[var(--muted)]">Create the owner account for this workspace.</p>
      </div>
      <SetupForm />
    </main>
  )
}
