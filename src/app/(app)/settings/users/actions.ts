'use server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { sendInviteEmail } from '@/lib/auth/email'
import { requireAdmin } from '@/lib/auth/guard'
import { createInvite } from '@/lib/auth/invites-repo'
import { canAssignRole, type Role, WORKSPACE_ROLES } from '@/lib/auth/roles'
import {
  createUser,
  deleteUser,
  setUserDisabled,
  setUserRole,
  transferOwnership,
} from '@/lib/auth/users-repo'
import { env } from '@/lib/env'

export type ActionState = { error: string } | null
export type InviteState = { error: string } | { acceptUrl: string } | null

function parseRole(v: FormDataEntryValue | null): Role | null {
  const s = typeof v === 'string' ? v : ''
  return (WORKSPACE_ROLES as readonly string[]).includes(s) ? (s as Role) : null
}

// CREATE a user directly (admin sets no password → disabled placeholder, OR a
// password). Anti-escalation: the actor may only assign a role strictly below
// their own (canAssignRole), enforced HERE, server-side.
export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  const name = String(fd.get('name') ?? '').trim()
  const role = parseRole(fd.get('role'))
  if (!email.includes('@')) return { error: 'A valid email is required.' }
  if (!name) return { error: 'Name is required.' }
  if (!role) return { error: 'Choose a role.' }
  if (!canAssignRole(actor, role))
    return { error: 'You do not have permission to assign that role.' }
  try {
    const u = await createUser({ email, name, role, disabled: true }) // no password yet → must be invited/reset
    await logAudit('user.create', {
      actorId: actor.id,
      targetType: 'user',
      targetId: u.id,
      meta: { role },
    })
  } catch {
    return { error: 'Could not create the user (email may already exist).' }
  }
  revalidatePath('/settings/users')
  return null
}

// INVITE a user by email. Creates the invite and returns the accept URL (always
// shown in the UI as a copyable link) AND best-effort emails it (Group B).
export async function inviteUserAction(_p: InviteState, fd: FormData): Promise<InviteState> {
  const actor = await requireAdmin()
  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  const role = parseRole(fd.get('role'))
  if (!email.includes('@')) return { error: 'A valid email is required.' }
  if (!role) return { error: 'Choose a role.' }
  if (!canAssignRole(actor, role))
    return { error: 'You do not have permission to assign that role.' }

  const { token } = await createInvite({ email, role, invitedBy: actor.id, ttlHours: 72 })
  // invite link uses env.publicUrl (§7n); call sendInviteEmail with the OBJECT form
  const acceptUrl = `${env.publicUrl.replace(/\/$/, '')}/accept/${token}`
  await sendInviteEmail({
    to: email,
    inviterName: actor.name,
    workspaceName: 'Parchment',
    acceptUrl,
  }) // never throws / never blocks
  await logAudit('user.invite', { actorId: actor.id, targetType: 'user', meta: { email, role } })
  revalidatePath('/settings/users')
  return { acceptUrl }
}

export async function setUserRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  const role = parseRole(fd.get('role'))
  if (!userId || !role) return { error: 'Invalid request.' }
  if (!canAssignRole(actor, role))
    return { error: 'You do not have permission to assign that role.' }
  try {
    await setUserRole(userId, role)
    await logAudit('user.role', {
      actorId: actor.id,
      targetType: 'user',
      targetId: userId,
      meta: { role },
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not change the role.' }
  }
  revalidatePath('/settings/users')
  return null
}

export async function setUserDisabledAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  const disabled = String(fd.get('disabled') ?? '') === 'true'
  if (!userId) return { error: 'Invalid request.' }
  // Disabling yourself is allowed only if it doesn't break the owner invariant
  // (the repo enforces that); but warn against the obvious self-lockout.
  if (userId === actor.id && disabled) return { error: 'You cannot disable your own account.' }
  try {
    await setUserDisabled(userId, disabled)
    await logAudit(disabled ? 'user.disable' : 'user.enable', {
      actorId: actor.id,
      targetType: 'user',
      targetId: userId,
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update the account.' }
  }
  revalidatePath('/settings/users')
  return null
}

export async function deleteUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  if (!userId) return { error: 'Invalid request.' }
  if (userId === actor.id) return { error: 'You cannot delete your own account.' }
  try {
    await deleteUser(userId)
    await logAudit('user.delete', { actorId: actor.id, targetType: 'user', targetId: userId })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not delete the user.' }
  }
  revalidatePath('/settings/users')
  return null
}

// TRANSFER OWNERSHIP — owner-only (not merely admin). The actor MUST currently be
// the owner; the repo performs the atomic swap and refuses non-owner sources.
export async function transferOwnershipAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  if (actor.role !== 'owner') return { error: 'Only the owner can transfer ownership.' }
  const toId = String(fd.get('toUserId') ?? '')
  if (!toId) return { error: 'Choose a user to transfer ownership to.' }
  try {
    await transferOwnership(actor.id, toId)
    await logAudit('ownership.transfer', { actorId: actor.id, targetType: 'user', targetId: toId })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not transfer ownership.' }
  }
  revalidatePath('/settings/users')
  return null
}
