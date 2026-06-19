import Link from 'next/link'
import { requireUser } from '@/lib/auth/guard'
import { listDocuments } from '@/lib/docs/repo'
import { newDocument } from './actions'

const fmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

export default async function FilesPage() {
  const user = await requireUser()
  const docs = await listDocuments(user.id)

  return (
    <section className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl tracking-tight">Files</h1>
        <form action={newDocument}>
          <button
            type="submit"
            className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 font-medium text-sm text-white"
          >
            + New document
          </button>
        </form>
      </div>
      <p className="mt-1 text-[var(--muted)] text-sm">
        Minimal list for v0.1 — the full Drive-style file manager is Plan E.
      </p>

      {docs.length === 0 ? (
        <p className="mt-8 text-[var(--muted)]">No documents yet. Create one to start writing.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[var(--border)]">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={`/d/${d.id}`}
                className="flex items-center justify-between py-3 hover:text-[var(--accent-contrast)]"
              >
                <span className="font-medium">{d.title}</span>
                <time className="text-[var(--muted)] text-xs" dateTime={d.updatedAt.toISOString()}>
                  {fmt.format(d.updatedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
