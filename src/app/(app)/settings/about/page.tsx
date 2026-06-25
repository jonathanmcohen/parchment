import type { Metadata } from 'next'
import { RELEASE_NOTES } from '@/lib/help/content'
import {
  APP_LICENSE_URL,
  APP_REPO_URL,
  APP_VERSION,
  BUILD_SHA,
  BUILD_SHA_SHORT,
} from '@/lib/version'

// I5: About lives INSIDE the settings shell (Settings › About) like every other
// settings subsection — it was previously a standalone /whats-new route outside
// settings. The settings layout supplies the nav + content column; /whats-new now
// permanently redirects here. Reuses I9's RELEASE_NOTES (single source of truth).

export const metadata: Metadata = {
  title: `About — Parchment v${APP_VERSION}`,
}

export default function AboutSettingsPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">
        About <span className="text-[var(--muted)]">v{RELEASE_NOTES.version}</span>
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        Release highlights and build information. You can also re-open the highlights any time from
        the Help menu in the sidebar.
      </p>

      <h2 className="mt-6 font-medium text-lg">What&rsquo;s new</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-[var(--foreground)]">
        {RELEASE_NOTES.highlights.map((highlight) => (
          <li key={highlight}>{highlight}</li>
        ))}
      </ul>

      {/* F7: About facts — version, source link, and a license line. */}
      <h2 className="mt-8 font-medium text-lg">Details</h2>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-medium">Version</dt>
          <dd className="text-[var(--muted)]">v{APP_VERSION}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">Build</dt>
          <dd className="text-[var(--muted)]">
            {BUILD_SHA === 'dev' ? (
              <code className="font-mono">dev</code>
            ) : (
              <a
                href={`${APP_REPO_URL}/commit/${BUILD_SHA}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--primary)] underline"
              >
                {BUILD_SHA_SHORT}
              </a>
            )}
          </dd>
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
