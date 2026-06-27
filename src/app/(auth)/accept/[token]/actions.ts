'use server'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'
import { acceptInvite } from '@/lib/auth/invites-repo'
import { validateNewPassword } from '@/lib/auth/password-policy'
import { createSession } from '@/lib/auth/session'

export type AcceptState = { error: string } | null

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!name) return { error: 'Name is required.' }
  // validateNewPassword returns an error CODE ('password_too_short' | null), not a
  // display string — map it to a user-facing message (mirrors /setup's 8-char rule).
  const pwCode = validateNewPassword(password)
  if (pwCode === 'password_too_short')
    return { error: 'Password must be at least 8 characters.' }

  const res = await acceptInvite(token, { name, password })
  if (!res.ok) return { error: 'This invitation is no longer valid.' }

  await logAudit('user.create', {
    actorId: res.userId,
    targetType: 'user',
    targetId: res.userId,
    meta: { via: 'invite' },
  })
  await createSession(res.userId) // log the new user straight in
  redirect('/')
}
