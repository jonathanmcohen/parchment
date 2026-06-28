// B seam. Group B owns the real transport (SMTP) at src/lib/email/send.ts and
// exports EmailPayload + inviteEmailPayload. A imports those types/helpers via a
// dynamic import with a no-op fallback so A builds and runs BEFORE B is merged.
// The local OutboundEmail type is DELETED — use B's EmailPayload instead.
// The invite link is ALSO surfaced in the admin UI (copy button) so an
// unconfigured SMTP never blocks onboarding.
import 'server-only'
import { env } from '@/lib/env'

// B's types — dynamically imported at runtime; type-only import for TS.
// When B is merged, replace the `type` import below with a static import.
type EmailPayload = { to: string; subject: string; text: string; html?: string; replyTo?: string }

// B's module specifier. Held in a variable (not a string literal in the import())
// so TypeScript does NOT eagerly resolve it at build time — A must compile BEFORE
// Group B ships src/lib/email/send.ts. When B is merged, switch to a static import.
const EMAIL_MODULE = '@/lib/email/send'

// Dynamic lookup so A does not hard-depend on B at build time.
// When B ships src/lib/email/send.ts this resolves automatically.
async function deliver(msg: EmailPayload): Promise<void> {
  try {
    const mod = (await import(EMAIL_MODULE).catch(() => null)) as {
      sendEmail?: (m: EmailPayload) => Promise<unknown>
    } | null
    if (mod?.sendEmail) {
      await mod.sendEmail(msg)
      return
    }
  } catch {
    // fall through to no-op
  }
  if (env.nodeEnv !== 'production') {
    console.info('[email:noop] would send', { to: msg.to, subject: msg.subject })
  }
}

// Uses B's inviteEmailPayload with the OBJECT form {to, inviterName, workspaceName, acceptUrl}
// (§7n: B re-exports it from @/lib/email/send; the arg is an object, NOT positional strings).
// The acceptUrl is built from env.publicUrl (§7n: invite links use env.publicUrl).
// Falls back to an inline payload when B is not yet merged.
// When B is merged, replace the dynamic import block with a static import:
//   import { inviteEmailPayload } from '@/lib/email/send'
//   const payload = inviteEmailPayload({ to, inviterName, workspaceName, acceptUrl })
export async function sendInviteEmail(input: {
  to: string
  inviterName: string
  workspaceName: string
  acceptUrl: string
}): Promise<void> {
  const { to, inviterName, workspaceName, acceptUrl } = input
  let payload: EmailPayload
  try {
    const mod = (await import(EMAIL_MODULE).catch(() => null)) as {
      inviteEmailPayload?: (opts: {
        to: string
        inviterName: string
        workspaceName: string
        acceptUrl: string
      }) => EmailPayload
    } | null
    // Call with the OBJECT form (§7n — not positional):
    payload = mod?.inviteEmailPayload?.({ to, inviterName, workspaceName, acceptUrl }) ?? {
      to,
      subject: `${inviterName} invited you to ${workspaceName}`,
      text: `${inviterName} invited you to join ${workspaceName} on Parchment. Set your password to get started:\n\n${acceptUrl}\n\nThis link expires soon.`,
      html: `<p>${inviterName} invited you to join <strong>${workspaceName}</strong> on Parchment.</p><p><a href="${acceptUrl}">Set your password to get started</a></p><p>This link expires soon.</p>`,
    }
  } catch {
    payload = {
      to,
      subject: `${inviterName} invited you to ${workspaceName}`,
      text: `${inviterName} invited you to join ${workspaceName} on Parchment. Set your password to get started:\n\n${acceptUrl}\n\nThis link expires soon.`,
    }
  }
  await deliver(payload)
}
