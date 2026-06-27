// Pure email template builders — no DB, no crypto, no sending.
// Each function produces an EmailPayload object (text + optional HTML).
// HTML bodies are minimal inline-styled strings with no external dependencies.
// All outputs are XSS-safe: no user input is interpolated into <script> tags.

// EmailPayload type is also exported from @/lib/email/send (which re-exports this).
// Defined here to avoid circular imports (send.ts imports templates, templates
// must not import from send).
export type EmailPayload = {
  to: string | string[]
  subject: string
  text: string // plain-text fallback (required)
  html?: string // optional HTML body
  replyTo?: string
}

/** Minimal HTML escape — prevents user-supplied strings from breaking HTML structure. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Builds an invite email for a new workspace member.
 * A and any caller imports inviteEmailPayload from @/lib/email/send (re-exported there).
 */
export function inviteEmailPayload(opts: {
  to: string
  inviterName: string
  workspaceName: string
  acceptUrl: string
}): EmailPayload {
  const { to, inviterName, workspaceName, acceptUrl } = opts
  const subject = `${inviterName} invited you to ${workspaceName} on Parchment`

  const text = [
    `Hi,`,
    ``,
    `${inviterName} has invited you to join "${workspaceName}" on Parchment.`,
    ``,
    `Accept your invitation:`,
    acceptUrl,
    ``,
    `If you were not expecting this invitation, you can safely ignore this email.`,
    ``,
    `— The Parchment team`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111;line-height:1.6">
  <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">${esc(subject)}</h2>
  <p>${esc(inviterName)} has invited you to join <strong>${esc(workspaceName)}</strong> on Parchment.</p>
  <p style="margin-top:24px">
    <a href="${esc(acceptUrl)}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600">
      Accept invitation
    </a>
  </p>
  <p style="margin-top:24px;font-size:13px;color:#555">
    Or copy this link into your browser:<br>
    <span style="word-break:break-all">${esc(acceptUrl)}</span>
  </p>
  <p style="font-size:13px;color:#555">If you were not expecting this invitation, you can safely ignore this email.</p>
</body>
</html>`

  return { to, subject, text, html }
}

/**
 * Builds a password-reset email.
 */
export function passwordResetEmailPayload(opts: {
  to: string
  resetUrl: string
  expiresInMinutes: number
}): EmailPayload {
  const { to, resetUrl, expiresInMinutes } = opts
  const subject = 'Reset your Parchment password'

  const text = [
    `Hi,`,
    ``,
    `You requested a password reset for your Parchment account.`,
    ``,
    `Reset your password (expires in ${expiresInMinutes} minutes):`,
    resetUrl,
    ``,
    `If you did not request a password reset, you can safely ignore this email.`,
    ``,
    `— The Parchment team`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111;line-height:1.6">
  <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">${esc(subject)}</h2>
  <p>You requested a password reset for your Parchment account.</p>
  <p style="margin-top:24px">
    <a href="${esc(resetUrl)}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600">
      Reset password
    </a>
  </p>
  <p style="margin-top:24px;font-size:13px;color:#555">
    This link expires in ${expiresInMinutes} minutes.<br>
    Or copy this link: <span style="word-break:break-all">${esc(resetUrl)}</span>
  </p>
  <p style="font-size:13px;color:#555">If you did not request a password reset, you can safely ignore this email.</p>
</body>
</html>`

  return { to, subject, text, html }
}

/**
 * Builds a share-notification email for a document shared with a user.
 */
export function shareNotificationEmailPayload(opts: {
  to: string
  sharedByName: string
  docTitle: string
  shareUrl: string
  permission: string
}): EmailPayload {
  const { to, sharedByName, docTitle, shareUrl, permission } = opts
  const subject = `${sharedByName} shared "${docTitle}" with you on Parchment`

  const text = [
    `Hi,`,
    ``,
    `${sharedByName} shared "${docTitle}" with you on Parchment (as ${permission}).`,
    ``,
    `View document:`,
    shareUrl,
    ``,
    `— The Parchment team`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="font-family:sans-serif;max-width:560px;margin:40px auto;color:#111;line-height:1.6">
  <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">${esc(sharedByName)} shared a document with you</h2>
  <p><strong>${esc(sharedByName)}</strong> shared <strong>${esc(docTitle)}</strong> with you as <em>${esc(permission)}</em>.</p>
  <p style="margin-top:24px">
    <a href="${esc(shareUrl)}" style="display:inline-block;background:#1a56db;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600">
      View document
    </a>
  </p>
  <p style="margin-top:16px;font-size:13px;color:#555">
    Or copy this link: <span style="word-break:break-all">${esc(shareUrl)}</span>
  </p>
</body>
</html>`

  return { to, subject, text, html }
}
