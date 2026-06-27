import { notFound } from 'next/navigation'
import { getInviteByToken } from '@/lib/auth/invites-repo'
import { AcceptForm } from './accept-form'

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInviteByToken(token)
  if (!invite) notFound() // expired / used / unknown → 404, no detail leak
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="font-semibold text-2xl">Set up your account</h1>
      <p className="mt-2 text-[var(--muted)]">
        You were invited as <strong>{invite.email}</strong>.
      </p>
      <AcceptForm token={token} email={invite.email} />
    </main>
  )
}
