// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FindReplaceExtension, getFindState } from '@/lib/editor/extensions/find-replace'

// Minimal extension set: StarterKit + FindReplace (no Collaboration needed)
const extensions = [StarterKit.configure({ undoRedo: false }), FindReplaceExtension]

let editor: Editor

beforeEach(() => {
  editor = new Editor({
    extensions,
    content: '<p>the cat sat on the mat</p>',
  })
})

afterEach(() => {
  editor.destroy()
})

describe('FindReplace extension (headless)', () => {
  it('setFindQuery("the") populates matches', () => {
    editor.commands.setFindQuery('the')
    const s = getFindState(editor.state)
    expect(s.matches.length).toBe(2)
    expect(s.error).toBeNull()
    expect(s.activeIndex).toBe(0)
  })

  it('findNext advances activeIndex', () => {
    editor.commands.setFindQuery('the')
    editor.commands.findNext()
    const s = getFindState(editor.state)
    expect(s.activeIndex).toBe(1)
  })

  it('findPrev wraps around to last match', () => {
    editor.commands.setFindQuery('the')
    editor.commands.findPrev()
    const s = getFindState(editor.state)
    expect(s.activeIndex).toBe(1) // wraps 0 - 1 = last (1)
  })

  it('replaceAll replaces all occurrences in doc text', () => {
    editor.commands.setFindQuery('the')
    editor.commands.replaceAll('a')
    expect(editor.getText()).toBe('a cat sat on a mat')
  })

  it('clearFind empties matches', () => {
    editor.commands.setFindQuery('the')
    editor.commands.clearFind()
    const s = getFindState(editor.state)
    expect(s.matches.length).toBe(0)
    expect(s.query).toBe('')
  })

  it('replaceCurrent replaces only the active match', () => {
    editor.commands.setFindQuery('the')
    // active is first "the"
    editor.commands.replaceCurrent('X')
    const text = editor.getText()
    // First "the" replaced, second remains
    expect(text).toContain('X')
    expect(text).toContain('the')
  })

  it('invalid regex returns error, no crash', () => {
    editor.commands.setFindQuery('(', { regex: true })
    const s = getFindState(editor.state)
    expect(s.error).toBeTruthy()
    expect(s.matches.length).toBe(0)
  })

  it('caseSensitive option limits matches', () => {
    // "the" appears twice lowercase; uppercase would be 0
    editor.commands.setFindQuery('THE', { caseSensitive: true })
    const s = getFindState(editor.state)
    expect(s.matches.length).toBe(0)
  })

  it('selection scope limits matches to selected range', () => {
    // Select only first 8 chars: "the cat "
    // Position 1 is start of paragraph text in ProseMirror
    editor.commands.setTextSelection({ from: 1, to: 9 })
    editor.commands.setFindQuery('the', { scope: 'selection' })
    const s = getFindState(editor.state)
    // Only 1 "the" should be in first 8 chars
    expect(s.matches.length).toBe(1)
  })

  it('empty query produces no matches', () => {
    editor.commands.setFindQuery('')
    const s = getFindState(editor.state)
    expect(s.matches.length).toBe(0)
  })
})
