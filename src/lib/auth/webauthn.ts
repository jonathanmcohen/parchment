import 'server-only'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

// The Relying Party name shown in the authenticator UI.
export const RP_NAME = 'Parchment'

// Short-lived cookie that carries the WebAuthn challenge between the
// options and verify steps of a ceremony. httpOnly + sameSite so it cannot be
// read by scripts and rides only same-site navigations/fetches.
const CHALLENGE_REGISTER = 'parchment_wa_reg'
const CHALLENGE_AUTH = 'parchment_wa_auth'
const CHALLENGE_TTL_SECONDS = 60 * 5 // 5 minutes — one ceremony

export type RpContext = { rpID: string; origin: string }

// The dev-only RP context. WebAuthn requires the origin/RPID to be a fixed,
// trusted server constant — it IS the anti-phishing anchor that
// verifyRegistration/AuthenticationResponse compares the ceremony against. We
// therefore NEVER derive it from request headers (Host/Origin/X-Forwarded-*),
// which an attacker or a hostile/misconfigured proxy hop can spoof; a spoofed
// value would silently validate a phished credential against the wrong origin.
const DEV_RP_ID = 'localhost'
const DEV_RP_ORIGIN = 'http://localhost:3000'

// Resolves the RP ID (bare domain) and expected origin from FIXED server config.
// In production both PARCHMENT_RP_ID and PARCHMENT_RP_ORIGIN must be set or this
// FAILS CLOSED (throws) — passkeys are unavailable until configured rather than
// silently trusting attacker-influenceable headers. In development it falls back
// to localhost:3000 so a self-hoster can try passkeys without config locally.
export async function rpContext(): Promise<RpContext> {
  if (env.webauthnRpId && env.webauthnOrigin) {
    return { rpID: env.webauthnRpId, origin: env.webauthnOrigin }
  }

  if (env.nodeEnv === 'production') {
    throw new Error(
      'WebAuthn is not configured: set PARCHMENT_RP_ID and PARCHMENT_RP_ORIGIN ' +
        'to your deployment origin. They are the anti-phishing anchor and must be ' +
        'fixed server config, never derived from request headers.',
    )
  }

  // Development convenience only. Partial config still requires both to be set
  // explicitly to avoid mixing a configured origin with a derived RPID.
  if (env.webauthnRpId || env.webauthnOrigin) {
    throw new Error(
      'WebAuthn is partially configured: set BOTH PARCHMENT_RP_ID and PARCHMENT_RP_ORIGIN.',
    )
  }
  return { rpID: DEV_RP_ID, origin: DEV_RP_ORIGIN }
}

function challengeCookieOpts(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export async function storeRegistrationChallenge(challenge: string): Promise<void> {
  const store = await cookies()
  store.set(CHALLENGE_REGISTER, challenge, challengeCookieOpts(CHALLENGE_TTL_SECONDS))
}

export async function takeRegistrationChallenge(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CHALLENGE_REGISTER)?.value ?? null
  store.delete(CHALLENGE_REGISTER)
  return value
}

export async function storeAuthChallenge(challenge: string): Promise<void> {
  const store = await cookies()
  store.set(CHALLENGE_AUTH, challenge, challengeCookieOpts(CHALLENGE_TTL_SECONDS))
}

export async function takeAuthChallenge(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CHALLENGE_AUTH)?.value ?? null
  store.delete(CHALLENGE_AUTH)
  return value
}
