// A2: workspace RBAC. owner > admin > editor > viewer. Pure, dependency-free so
// it is trivially unit-testable AND importable from both server and client code
// (it touches no db). All authorization *decisions* funnel through these helpers
// so the lattice has one source of truth.

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export const WORKSPACE_ROLES: readonly Role[] = ['owner', 'admin', 'editor', 'viewer']

export const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  editor: 1,
  viewer: 0,
}

// Rank of an arbitrary string. An unrecognized role ranks BELOW viewer (-1) so a
// corrupt/legacy value can never accidentally satisfy a privilege check.
export function roleRank(role: string): number {
  return role in ROLE_RANK ? ROLE_RANK[role as Role] : -1
}

// True when the user's role is >= the minimum required role (inclusive).
export function hasRoleAtLeast(user: { role: string }, min: Role): boolean {
  return roleRank(user.role) >= ROLE_RANK[min]
}

// Admin-level = owner or admin. The single definition; guard.ts re-exports this.
export function isAdmin(user: { role: string }): boolean {
  return hasRoleAtLeast(user, 'admin')
}

// Anti-escalation: an actor may only assign a role STRICTLY BELOW their own rank,
// and never the 'owner' role (ownership changes hands only via transferOwnership).
// This blocks an admin from minting another admin/owner and blocks any non-admin
// from assigning roles at all.
export function canAssignRole(actor: { role: string }, target: Role): boolean {
  if (target === 'owner') return false
  // Only admin-level actors may assign roles at all; an editor/viewer can assign
  // nothing even though their rank is technically above 'viewer'. The actor must
  // also outrank the target (strictly) so an admin can never mint another admin.
  if (!isAdmin(actor)) return false
  return roleRank(actor.role) > ROLE_RANK[target]
}
