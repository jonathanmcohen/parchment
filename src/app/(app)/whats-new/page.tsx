import type { Metadata } from 'next'
import { RELEASE_NOTES } from '@/lib/help/content'
import { APP_LICENSE_URL, APP_REPO_URL, APP_VERSION } from '@/lib/version'

// L5: dedicated, linkable "What's new" page. Reuses I9's RELEASE_NOTES (single
// source of truth for the version + highlights) — the Help-menu drawer renders
// the same data; this is the routable surface for /whats-new. Server component;
// the (app) layout already supplies the <main> landmark, so this is a single
// <section> with an <h1> and an accessible list, satisfying the K1/K3 a11y bar.

export const metadata: Metadata = {
  title: `What's new in v${APP_VERSION}`,
}

export default function WhatsNewPage() {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">
        What's new in Parchment{' '}
        <span className="text-[var(--muted)]">v{RELEASE_NOTES.version}</span>
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Here are the highlights of this release. You can re-open this page any time from the Help
        menu in the sidebar or the Settings &rsaquo; About section.
      </p>
      <h2 className="mt-6 font-medium text-lg">Highlights</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-[var(--foreground)]">
        {RELEASE_NOTES.highlights.map((highlight) => (
          <li key={highlight}>{highlight}</li>
        ))}
      </ul>

      {/* F7: About facts — version, source link, and a license line. */}
      <h2 className="mt-8 font-medium text-lg">About</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Version</dt>
          <dd className="text-[var(--muted)]">v{APP_VERSION}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Source</dt>
          <dd>
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--primary)] underline"
            >
              github.com/jonathanmcohen/parchment
            </a>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">License</dt>
          <dd className="text-[var(--muted)]">
            See the{' '}
            <a
              href={APP_LICENSE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--primary)] underline"
            >
              LICENSE
            </a>{' '}
            in the source repository.
          </dd>
        </div>
      </dl>
    </section>
  )
}
