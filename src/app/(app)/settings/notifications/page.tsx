import Link from 'next/link'
import { isSmtpConfigured } from '@/lib/config/smtp-config-repo'

export const dynamic = 'force-dynamic'

export default async function NotificationsSettingsPage() {
  const smtpReady = await isSmtpConfigured()

  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Notifications</h1>
      <p className="mt-2 text-[var(--muted)]">Choose what you are notified about and where.</p>

      {!smtpReady && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-[var(--border)] bg-[var(--paper)] px-4 py-3 text-sm"
        >
          Email delivery is not configured.{' '}
          <Link href="/settings/admin/smtp" className="font-medium underline">
            Set up SMTP
          </Link>{' '}
          to enable notifications.
        </div>
      )}

      <section aria-labelledby="notifications-inbox" className="mt-8">
        <h2 id="notifications-inbox" className="font-medium text-lg">
          Inbox
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          In-app notifications for mentions, comments, and shares.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="inboxMentions"
              defaultChecked
              className="size-4 rounded border-[var(--border)]"
            />
            Mentions of me
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="inboxComments"
              defaultChecked
              className="size-4 rounded border-[var(--border)]"
            />
            Comments on my documents
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="inboxShares"
              defaultChecked
              className="size-4 rounded border-[var(--border)]"
            />
            Documents shared with me
          </label>
        </div>
      </section>

      <section aria-labelledby="notifications-email" className="mt-8">
        <h2 id="notifications-email" className="font-medium text-lg">
          Email
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          How often Parchment emails you a summary of inbox activity.
        </p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="notifications-email-frequency" className="font-medium text-sm">
            Email frequency
          </label>
          <select
            id="notifications-email-frequency"
            name="emailFrequency"
            defaultValue="daily"
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="off">Off</option>
            <option value="realtime">Real-time</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
          </select>
        </div>
      </section>
    </section>
  )
}
