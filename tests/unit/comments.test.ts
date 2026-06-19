import { describe, expect, it } from 'vitest'
import { parseMentions } from '@/lib/docs/comments-repo'

describe('D1 — parseMentions', () => {
  it('extracts @mention tokens from body', () => {
    expect(parseMentions('hi @alice and @bob_jones!')).toEqual(['alice', 'bob_jones'])
  })

  it('returns empty array when no mentions', () => {
    expect(parseMentions('no mentions here')).toEqual([])
  })

  it('does NOT match email addresses as mentions', () => {
    // a@b.com — the @ is preceded by a word char, not start/space
    expect(parseMentions('send to a@b.com please')).toEqual([])
  })

  it('matches a mention at start of string', () => {
    expect(parseMentions('@carol hello')).toEqual(['carol'])
  })

  it('handles multiple mentions on same word boundary', () => {
    expect(parseMentions('@alice @bob')).toEqual(['alice', 'bob'])
  })

  it('does not match mid-word @', () => {
    expect(parseMentions('user@example.com and also word@thing')).toEqual([])
  })
})
