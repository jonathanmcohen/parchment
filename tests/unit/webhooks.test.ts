import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildRequest,
  formatDiscord,
  formatSlack,
  isValidWebhookEvent,
  isValidWebhookUrl,
  signPayload,
  WEBHOOK_EVENTS,
} from '@/lib/integrations/webhooks'

// A representative webhook + payload reused across cases.
const SECRET = 'whsec_test_0123456789abcdef'
const BODY = JSON.stringify({ event: 'document.saved', data: { docId: 'd1', title: 'Hello' } })

describe('WEBHOOK_EVENTS', () => {
  it('is exactly the three supported event ids', () => {
    expect([...WEBHOOK_EVENTS].sort()).toEqual([
      'comment.created',
      'document.published',
      'document.saved',
    ])
  })
})

describe('signPayload', () => {
  it('is a stable HMAC-SHA256 of (secret, body), `sha256=` + lowercase hex', () => {
    // Independent reference vector computed with node:crypto directly.
    const expected = `sha256=${createHmac('sha256', SECRET).update(BODY).digest('hex')}`
    expect(signPayload(SECRET, BODY)).toBe(expected)
  })

  it('is deterministic — the same (secret, body) always signs identically', () => {
    expect(signPayload(SECRET, BODY)).toBe(signPayload(SECRET, BODY))
  })

  it('differs when the secret changes (same body)', () => {
    expect(signPayload(SECRET, BODY)).not.toBe(signPayload(`${SECRET}x`, BODY))
  })

  it('differs when the body changes (same secret)', () => {
    expect(signPayload(SECRET, BODY)).not.toBe(signPayload(SECRET, `${BODY} `))
  })
})

describe('formatSlack', () => {
  it('returns an object with a non-empty `text` summarizing the event', () => {
    const msg = formatSlack('document.published', { docId: 'd1', title: 'My Doc' })
    expect(typeof msg.text).toBe('string')
    expect(msg.text.length).toBeGreaterThan(0)
    expect(msg.text).toContain('My Doc')
  })
})

describe('formatDiscord', () => {
  it('returns an object with a non-empty `content` summarizing the event', () => {
    const msg = formatDiscord('comment.created', { docId: 'd1', snippet: 'nice work' })
    expect(typeof msg.content).toBe('string')
    expect(msg.content.length).toBeGreaterThan(0)
    expect(msg.content).toContain('nice work')
  })
})

describe('buildRequest — generic', () => {
  const webhook = {
    url: 'https://example.com/hook',
    secret: SECRET,
    kind: 'generic' as const,
  }

  it('adds X-Parchment-Signature and X-Parchment-Event headers', () => {
    const req = buildRequest(webhook, 'document.saved', { docId: 'd1', title: 'Hello' })
    expect(req.url).toBe('https://example.com/hook')
    expect(req.headers['X-Parchment-Event']).toBe('document.saved')
    expect(req.headers['Content-Type']).toBe('application/json')
    // The signature is the HMAC of the EXACT body that is sent.
    expect(req.headers['X-Parchment-Signature']).toBe(signPayload(SECRET, req.body))
  })

  it('sends a JSON body carrying the event id and payload', () => {
    const req = buildRequest(webhook, 'document.saved', { docId: 'd1', title: 'Hello' })
    const parsed = JSON.parse(req.body) as { event: string; data: unknown }
    expect(parsed.event).toBe('document.saved')
    expect(parsed.data).toEqual({ docId: 'd1', title: 'Hello' })
  })
})

describe('buildRequest — slack/discord', () => {
  it('omits the signature header for slack and uses the Slack-formatted body', () => {
    const req = buildRequest(
      { url: 'https://hooks.slack.com/services/x', secret: SECRET, kind: 'slack' },
      'document.published',
      { docId: 'd1', title: 'Doc' },
    )
    expect(req.headers['X-Parchment-Signature']).toBeUndefined()
    expect(req.headers['X-Parchment-Event']).toBeUndefined()
    const parsed = JSON.parse(req.body) as { text?: string }
    expect(typeof parsed.text).toBe('string')
  })

  it('omits the signature header for discord and uses the Discord-formatted body', () => {
    const req = buildRequest(
      { url: 'https://discord.com/api/webhooks/x/y', secret: SECRET, kind: 'discord' },
      'comment.created',
      { docId: 'd1', snippet: 'hi' },
    )
    expect(req.headers['X-Parchment-Signature']).toBeUndefined()
    const parsed = JSON.parse(req.body) as { content?: string }
    expect(typeof parsed.content).toBe('string')
  })
})

describe('buildRequest — validation', () => {
  it('throws on an unknown event id', () => {
    expect(() =>
      buildRequest(
        { url: 'https://example.com/hook', secret: SECRET, kind: 'generic' },
        // @ts-expect-error — deliberately invalid event id
        'document.deleted',
        {},
      ),
    ).toThrow()
  })
})

describe('isValidWebhookEvent', () => {
  it('accepts the known events and rejects anything else', () => {
    expect(isValidWebhookEvent('document.saved')).toBe(true)
    expect(isValidWebhookEvent('comment.created')).toBe(true)
    expect(isValidWebhookEvent('document.deleted')).toBe(false)
    expect(isValidWebhookEvent('')).toBe(false)
  })
})

describe('isValidWebhookUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isValidWebhookUrl('https://example.com/hook')).toBe(true)
    expect(isValidWebhookUrl('http://localhost:9000/hook')).toBe(true)
  })

  it('rejects non-http(s) schemes and garbage', () => {
    expect(isValidWebhookUrl('ftp://example.com')).toBe(false)
    expect(isValidWebhookUrl('javascript:alert(1)')).toBe(false)
    expect(isValidWebhookUrl('file:///etc/passwd')).toBe(false)
    expect(isValidWebhookUrl('not a url')).toBe(false)
    expect(isValidWebhookUrl('')).toBe(false)
  })
})
