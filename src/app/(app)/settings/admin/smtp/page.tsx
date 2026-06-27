import { SmtpConfigForm, type SmtpInitialConfig } from '@/components/settings/SmtpConfigForm'
import { requireAdmin } from '@/lib/auth/guard'
import {
  getSmtpConfig,
  getSmtpPasswordMasked,
  isSmtpConfigured,
} from '@/lib/config/smtp-config-repo'

export const dynamic = 'force-dynamic'

export default async function SmtpSettingsPage() {
  await requireAdmin()

  const configured = await isSmtpConfigured()
  const config = await getSmtpConfig()
  const password = await getSmtpPasswordMasked()

  const initialConfig: SmtpInitialConfig =
    configured && config
      ? {
          configured: true,
          host: config.host,
          port: config.port,
          user: config.user,
          fromAddress: config.fromAddress,
          tls: config.tls,
          password: password ?? '',
        }
      : {
          configured: false,
          host: '',
          port: 587,
          user: '',
          fromAddress: '',
          tls: 'starttls',
          password: '',
        }

  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Email (SMTP)</h1>
      <p className="mt-2 text-[var(--muted)]">
        Configure outbound email for invites and notifications. All credentials are encrypted at
        rest.
      </p>

      <div className="mt-8">
        <SmtpConfigForm initialConfig={initialConfig} />
      </div>
    </section>
  )
}
