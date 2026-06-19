import Link from 'next/link'
import { CommandPaletteMount } from '@/components/CommandPaletteMount'
import { requireUser } from '@/lib/auth/guard'
import { SignOutButton } from '@/lib/auth/sign-out-button'

const nav = [
  { href: '/files', label: 'Files' },
  { href: '/templates', label: 'Templates' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/trash', label: 'Trash' },
  { href: '/settings', label: 'Settings' },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Gate the whole app group: unauthenticated visitors are sent to /login.
  const user = await requireUser()

  return (
    <div className="flex min-h-screen">
      <CommandPaletteMount />
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-[var(--border)] border-r bg-[var(--paper)] p-4">
        <Link href="/" className="mb-4 px-2 font-semibold text-lg tracking-tight">
          Parchment
        </Link>
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2 py-1.5 text-[var(--foreground)] text-sm hover:bg-[var(--background)]"
          >
            {item.label}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-1 border-[var(--border)] border-t pt-4">
          <span className="px-2 text-[var(--muted)] text-xs">{user.name}</span>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
