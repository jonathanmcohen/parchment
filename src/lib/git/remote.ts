import fs from 'node:fs'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { gitDir } from '@/lib/git/repo' // already exists — DO NOT recreate
import type { GitSyncConfig } from './sync-config'

// E — isomorphic-git HTTPS push wrapper. Token auth via onAuth. Disk is the
// source of truth; this only PUSHES (never pull/merge/rebase). A non-fast-forward
// is surfaced as an error, never resolved by force.

export type PushResult =
  | { ok: true; oid: string }
  | {
      ok: false
      error: 'not_configured' | 'non_fast_forward' | 'auth_failed' | 'network' | 'unknown'
      message: string
    }

/**
 * Push the files-root repo's `branch` to the configured HTTPS remote using the
 * token as the password (username 'x-token' — Gitea/GitHub/GitLab all accept a
 * PAT as the password). Returns a classified PushResult; the token is NEVER
 * echoed in any message.
 */
export async function pushToRemote(config: GitSyncConfig): Promise<PushResult> {
  if (!config.enabled) {
    return { ok: false, error: 'not_configured', message: 'git sync is disabled' }
  }
  const dir = gitDir()
  try {
    // Ensure origin points at the configured URL.
    const remotes = await git.listRemotes({ fs, dir })
    const origin = remotes.find((r) => r.remote === 'origin')
    if (!origin || origin.url !== config.remoteUrl) {
      await git.addRemote({ fs, dir, remote: 'origin', url: config.remoteUrl, force: true })
    }
    await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: config.branch,
      onAuth: () => ({ username: 'x-token', password: config.token }),
    })
    const oid = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    return { ok: true, oid }
  } catch (err) {
    return classifyPushError(err, config.token)
  }
}

/**
 * Map a push error to a PushResult. The token is stripped from every message.
 * - non_fast_forward: code PushRejectedError OR message contains 'reject'.
 * - auth_failed: 401/403/Unauthorized/Forbidden → a fixed, token-free message.
 * - network: fetch/ECONN/network failures.
 * - unknown: everything else.
 */
export function classifyPushError(err: unknown, token: string): PushResult {
  const code = (err as { code?: string }).code ?? ''
  const rawMsg = err instanceof Error ? err.message : String(err)
  const msg = sanitize(rawMsg, token)
  const lower = msg.toLowerCase()

  if (code === 'PushRejectedError' || lower.includes('reject')) {
    return { ok: false, error: 'non_fast_forward', message: msg }
  }
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden')
  ) {
    // Fixed message — never reflect the (token-bearing) raw string back.
    return { ok: false, error: 'auth_failed', message: 'auth failed (check token)' }
  }
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econn') ||
    lower.includes('request to') ||
    lower.includes('enotfound') ||
    lower.includes('timed out')
  ) {
    return { ok: false, error: 'network', message: msg }
  }
  return { ok: false, error: 'unknown', message: msg }
}

/** Remove the token from a message before it leaves this module. */
function sanitize(msg: string, token: string): string {
  return token && msg.includes(token) ? msg.split(token).join('***') : msg
}
