import 'server-only'
// Canonical sendEmail interface — nodemailer is dynamically imported to keep it
// out of the client bundle. Never throws; never logs the SMTP password.
import { getAppConfig } from '@/lib/config/repo'
import { getSmtpConfig, isSmtpConfigured } from '@/lib/config/smtp-config-repo'
import type { EmailPayload } from '@/lib/email/templates'

// Re-export the shared type so callers can import EmailPayload from this module.
export type { EmailPayload } from '@/lib/email/templates'

export type SendEmailResult = { ok: true; messageId: string } | { ok: false; error: string }

/**
 * Sends an email via the DB-configured SMTP transport.
 * Returns { ok: false } (never throws) when unconfigured or on transport error.
 * The SMTP password is read from the encrypted config repo and NEVER logged.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  // 1. Check configuration
  const configured = await isSmtpConfigured()
  if (!configured) {
    return { ok: false, error: 'smtp_not_configured' }
  }

  // 2. Read non-secret config + decrypted password (repo.ts decrypts internally)
  const config = await getSmtpConfig()
  if (!config) {
    return { ok: false, error: 'smtp_not_configured' }
  }
  const password = await getAppConfig('smtp_password')

  // 3. Dynamic import to keep nodemailer out of the client bundle
  const nodemailer = await import('nodemailer')

  // 4. Build transporter options based on TLS mode
  const tlsOptions =
    config.tls === 'tls'
      ? { secure: true }
      : config.tls === 'starttls'
        ? { secure: false, requireTLS: true }
        : { secure: false, ignoreTLS: true }

  // Auth is omitted when user/password are absent (unauthenticated relay)
  const auth = config.user && password ? { user: config.user, pass: password } : undefined

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    ...tlsOptions,
    ...(auth ? { auth } : {}),
  })

  // 5. Normalise `to` to a comma-joined string (nodemailer accepts both, but
  //    tests assert on the exact string form)
  const toStr = Array.isArray(payload.to) ? payload.to.join(',') : payload.to

  // 6. Send
  try {
    const info = await transporter.sendMail({
      from: config.fromAddress,
      to: toStr,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
      ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
    })
    return { ok: true, messageId: info.messageId as string }
  } catch (err) {
    // Log only the message — NOT the full error object (which can contain auth
    // credentials in some SMTP stacks) and NOT the password variable.
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[smtp] send failed: ${msg}`)
    return { ok: false, error: msg }
  }
}

// Re-export inviteEmailPayload so A (and any caller) can import both
// sendEmail + inviteEmailPayload from this single canonical path (§7n).
export { inviteEmailPayload } from '@/lib/email/templates'
