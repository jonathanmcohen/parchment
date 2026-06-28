// §5.4 — admin gate + audit viewer (ip column + integrity banner).
//   (a) The admin layout calls requireAdmin() (which uses A's role lattice; the
//       string 'member' must NOT appear in the gate path).
//   (b) AuditLogView renders the IP column and a chain-OK / chain-broken banner from
//       the verifyAuditChain() result (rendered statically — no DB).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

describe('§5.4 — admin layout gate', () => {
  it('the layout invokes requireAdmin (redirects non-admins)', async () => {
    const requireAdmin = vi.fn(async () => ({ id: 'u', role: 'admin' }))
    vi.doMock('@/lib/auth/guard', () => ({ requireAdmin }))
    vi.resetModules()
    const mod = await import('@/app/(app)/settings/admin/layout')
    // Server Component: awaiting it runs the gate.
    await mod.default({ children: 'x' } as never)
    expect(requireAdmin).toHaveBeenCalledTimes(1)
    vi.doUnmock('@/lib/auth/guard')
  })

  it('the gate path never references the banned role string "member"', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/app/(app)/settings/admin/layout.tsx', 'utf8')
    expect(src).not.toContain("'member'")
    // and it imports the canonical requireAdmin from guard.ts
    expect(src).toMatch(/requireAdmin.*from '@\/lib\/auth\/guard'/s)
  })

  it('through the REAL requireAdmin: viewer/editor are redirected, admin/owner are not', async () => {
    // Drive the actual guard (A's role lattice) with getCurrentUser stubbed per-role
    // and redirect captured, so the gate verdict is exercised end-to-end without a DB.
    for (const [role, shouldRedirect] of [
      ['viewer', true],
      ['editor', true],
      ['admin', false],
      ['owner', false],
    ] as const) {
      vi.resetModules()
      const redirect = vi.fn((_: string) => {
        throw new Error('REDIRECT')
      })
      vi.doMock('next/navigation', () => ({ redirect }))
      vi.doMock('@/lib/auth/session', () => ({
        getCurrentUser: async () => ({ id: 'u', role, disabledAt: null }),
        SESSION_COOKIE: 'parchment_session',
        getUserByToken: async () => null,
      }))
      const mod = await import('@/app/(app)/settings/admin/layout')
      if (shouldRedirect) {
        await expect(mod.default({ children: 'x' } as never)).rejects.toThrow('REDIRECT')
        expect(redirect).toHaveBeenCalledWith('/')
      } else {
        await expect(mod.default({ children: 'x' } as never)).resolves.toBeDefined()
        expect(redirect).not.toHaveBeenCalled()
      }
      vi.doUnmock('next/navigation')
      vi.doUnmock('@/lib/auth/session')
    }
  })
})

describe('§5.4 — AuditLogView integrity banner + ip column', () => {
  async function render(integrity?: { ok: boolean; brokenAt?: string }) {
    const { AuditLogView } = await import('@/components/audit/AuditLogView')
    const rows = [
      {
        id: 'r1',
        action: 'login',
        actorId: 'actor-1',
        targetType: 'user',
        targetId: 'actor-1',
        meta: { factor: 'totp' },
        ip: '198.51.100.10',
        createdAt: new Date('2026-06-27T10:00:00Z'),
      },
    ]
    return renderToStaticMarkup(
      createElement(AuditLogView, integrity ? { rows, integrity } : { rows }),
    )
  }

  it('renders an "Integrity verified" banner when ok', async () => {
    const html = await render({ ok: true })
    expect(html).toMatch(/Integrity verified/i)
  })

  it('renders a "FAILED" banner with brokenAt when not ok', async () => {
    const html = await render({ ok: false, brokenAt: 'deadbeef' })
    expect(html).toMatch(/FAILED/i)
    expect(html).toContain('deadbeef')
  })

  it('renders the IP column header and the row ip value', async () => {
    const html = await render({ ok: true })
    expect(html).toContain('>IP<')
    expect(html).toContain('198.51.100.10')
  })
})
