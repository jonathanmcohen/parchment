import Link from 'next/link'

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight">Parchment</h1>
        <p className="text-[var(--muted)] text-lg">
          Markdown-first writing, page-bounded canvas, real-time collab. Self-hosted.
        </p>
        <span className="text-[var(--muted)] text-sm">v0.1.0 — single-user preview</span>
      </div>
      <nav className="flex flex-wrap gap-3">
        <Link
          href="/files"
          className="rounded-lg bg-[var(--accent-contrast)] px-4 py-2 font-medium text-white"
        >
          Open files
        </Link>
        <Link
          href="/api/health"
          className="rounded-lg border border-[var(--border)] px-4 py-2 font-medium"
        >
          Health
        </Link>
      </nav>
    </main>
  )
}
