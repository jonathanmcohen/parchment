import 'server-only'
import { cookies, headers } from 'next/headers'
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

// Resolves the RP ID (bare domain) and expected origin for the current request.
// Prefers explicit env overrides; otherwise derives from the request headers so
// a self-hoster needs no configuration. Falls back to localhost in dev.
export async function rpContext(): Promise<RpContext> {
  if (env.webauthnRpId && env.webauthnOrigin) {
    return { rpID: env.webauthnRpId, origin: env.webauthnOrigin }
  }

  const h = await headers()
  const origin = env.webauthnOrigin ?? originFromHeaders(h)
  const rpID = env.webauthnRpId ?? hostnameOf(origin)
  return { rpID, origin }
}

function originFromHeaders(h: Headers): string {
  const explicit = h.get('origin')
  if (explicit) return explicit

  const host = h.get('host') ?? 'localhost:3000'
  // Behind a proxy the forwarded proto is authoritative; else infer from host.
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return 'localhost'
  }
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
