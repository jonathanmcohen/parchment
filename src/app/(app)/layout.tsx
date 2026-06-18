import Link from 'next/link'

const nav = [
  { href: '/files', label: 'Files' },
  { href: '/templates', label: 'Templates' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/trash', label: 'Trash' },
  { href: '/settings', label: 'Settings' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
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
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
