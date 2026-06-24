import { userInitial } from '@/lib/shell/nav'

// S2-5 / S2-2: the initial-fallback avatar.
//
// Parchment v0.1 users have no profile image (the users table has name/email
// only — no image column, and v0.1.1 adds no new feature surface), so the
// avatar always renders the uppercased initial of the user's name on a brand
// circle. ONE avatar component, reused at 32px in the top-right UserCluster and
// at sidebar scale in the S2-2 bottom cluster — there is no second avatar.
//
// Pure presentation: no @/db, no client hooks, so it mounts in the server
// layout directly.
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = userInitial(name)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--primary)] font-[600] text-[var(--on-primary)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {initial}
    </span>
  )
}
