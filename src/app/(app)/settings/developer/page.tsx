import { WebhooksManager } from '@/components/settings/WebhooksManager'

export default function DeveloperSettingsPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Developer</h1>
      <p className="mt-2 text-[var(--muted)]">
        Programmatic access to your workspace for scripts and integrations.
      </p>

      <section aria-labelledby="developer-tokens" className="mt-8">
        <h2 id="developer-tokens" className="font-medium text-lg">
          Personal access tokens
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Tokens authenticate API requests on your behalf. In-app token creation and
          management is coming in a future release; for now, webhooks below cover most
          integration needs.
        </p>
      </section>

      <section aria-labelledby="developer-webhooks" className="mt-8">
        <h2 id="developer-webhooks" className="font-medium text-lg">
          Webhooks
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Send HTTP callbacks to your own services when documents change. Generic webhooks are
          signed with HMAC-SHA256 (verify the <code>X-Parchment-Signature</code> header); Slack and
          Discord presets post a formatted message to a channel.
        </p>
        <WebhooksManager />
      </section>
    </section>
  )
}
