import { describe, expect, it } from 'vitest'
import { parseQuery } from '@/lib/search/operators'

describe('parseQuery — structured search operators', () => {
  it('returns the whole string as text when there are no operators', () => {
    const r = parseQuery('quarterly report')
    expect(r.text).toBe('quarterly report')
    expect(r.filters).toEqual({})
  })

  it('extracts tag:foo into filters.tagName and strips it from text', () => {
    const r = parseQuery('report tag:work')
    expect(r.text).toBe('report')
    expect(r.filters.tagName).toBe('work')
  })

  it('extracts folder:bar into filters.folderName', () => {
    const r = parseQuery('folder:Projects notes')
    expect(r.text).toBe('notes')
    expect(r.filters.folderName).toBe('Projects')
  })

  it('extracts is:starred into filters.starred=true', () => {
    const r = parseQuery('is:starred budget')
    expect(r.text).toBe('budget')
    expect(r.filters.starred).toBe(true)
  })

  it('extracts title:"quoted phrase" into filters.titleContains preserving spaces', () => {
    const r = parseQuery('title:"year end" summary')
    expect(r.filters.titleContains).toBe('year end')
    expect(r.text).toBe('summary')
  })

  it('extracts an unquoted title: token', () => {
    const r = parseQuery('title:draft')
    expect(r.filters.titleContains).toBe('draft')
    expect(r.text).toBe('')
  })

  it('extracts before: and after: ISO dates', () => {
    const r = parseQuery('after:2026-01-01 before:2026-06-30 review')
    expect(r.filters.after).toBe('2026-01-01')
    expect(r.filters.before).toBe('2026-06-30')
    expect(r.text).toBe('review')
  })

  it('combines multiple operators and keeps remaining text', () => {
    const r = parseQuery('report tag:work is:starred folder:Q2')
    expect(r.text).toBe('report')
    expect(r.filters).toEqual({
      tagName: 'work',
      starred: true,
      folderName: 'Q2',
    })
  })

  it('ignores malformed dates (does not throw, leaves them as text)', () => {
    const r = parseQuery('before:notadate hello')
    expect(r.filters.before).toBeUndefined()
    // the malformed token is preserved as text so it never silently vanishes
    expect(r.text).toContain('before:notadate')
    expect(r.text).toContain('hello')
  })

  it('preserves a quoted phrase that is NOT an operator into text', () => {
    const r = parseQuery('"exact phrase" tag:x')
    expect(r.filters.tagName).toBe('x')
    expect(r.text).toBe('"exact phrase"')
  })

  it('supports quoted values for tag: and folder:', () => {
    const r = parseQuery('tag:"high priority" folder:"My Folder"')
    expect(r.filters.tagName).toBe('high priority')
    expect(r.filters.folderName).toBe('My Folder')
    expect(r.text).toBe('')
  })

  it('treats an unknown operator as plain text', () => {
    const r = parseQuery('color:red apples')
    expect(r.filters).toEqual({})
    expect(r.text).toBe('color:red apples')
  })

  it('is case-insensitive on operator keys and the starred value', () => {
    const r = parseQuery('Tag:work IS:Starred')
    expect(r.filters.tagName).toBe('work')
    expect(r.filters.starred).toBe(true)
    expect(r.text).toBe('')
  })

  it('supports -tag:x negation into filters.excludeTagName', () => {
    const r = parseQuery('report -tag:archive')
    expect(r.filters.excludeTagName).toBe('archive')
    expect(r.text).toBe('report')
  })

  it('the last value wins when an operator is repeated', () => {
    const r = parseQuery('tag:a tag:b')
    expect(r.filters.tagName).toBe('b')
  })

  it('returns empty text + empty filters for an empty string', () => {
    expect(parseQuery('')).toEqual({ text: '', filters: {} })
    expect(parseQuery('   ')).toEqual({ text: '', filters: {} })
  })

  it('only is:starred is a recognized is: value — is:other is text', () => {
    const r = parseQuery('is:other note')
    expect(r.filters.starred).toBeUndefined()
    expect(r.text).toBe('is:other note')
  })
})
