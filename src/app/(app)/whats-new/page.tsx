import type { Metadata } from 'next'
import { RELEASE_NOTES } from '@/lib/help/content'
import { APP_VERSION } from '@/lib/version'

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
    </section>
  )
}
