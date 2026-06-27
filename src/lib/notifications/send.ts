import 'server-only'
import { getUser } from '@/lib/auth/users-repo'
// Notification helper for H (and any other caller needing to send email by userId).
// Resolves the user's email from the DB then delegates to sendEmail.
// Never throws — all error paths return { ok: false }.
import { sendEmail } from '@/lib/email/send'

export type NotificationPayload = {
  userId: string // recipient user ID; resolved to email internally
  subject: string
  text: string
  html?: string
}

export type SendNotificationResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a notification email to a user by userId.
 * Resolves the user's email from the DB; falls through to sendEmail.
 * Returns { ok: false } silently when SMTP is unconfigured (same semantics as sendEmail).
 * Never throws.
 */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<SendNotificationResult> {
  let user: Awaited<ReturnType<typeof getUser>>
  try {
    user = await getUser(payload.userId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[notifications] failed to resolve user ${payload.userId}: ${msg}`)
    return { ok: false, error: 'user_lookup_failed' }
  }

  if (!user) {
    return { ok: false, error: 'user_not_found' }
  }

  let result: Awaited<ReturnType<typeof sendEmail>>
  try {
    result = await sendEmail({
      to: user.email,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  return { ok: true }
}
