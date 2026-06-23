// G16: Unit tests for splitIntoSlides — pure slide-split logic.

import { describe, expect, it } from 'vitest'
import { splitIntoSlides } from '@/lib/editor/presenter'

// ── Helpers ────────────────────────────────────────────────────────────────

function h1(text: string) {
  return { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] }
}

function p(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function pageBreak() {
  return { type: 'pageBreak' }
}

function speakerNote(text: string) {
  return { type: 'speakerNote', content: [{ type: 'text', text }] }
}

function doc(...nodes: Record<string, unknown>[]) {
  return { type: 'doc', content: nodes }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('splitIntoSlides', () => {
  it('splits a doc with one pageBreak into 2 slides with correct blocks', () => {
    const d = doc(h1('Slide 1'), p('body 1'), pageBreak(), h1('Slide 2'), p('body 2'))
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(2)
    expect(slides[0]?.content).toHaveLength(2)
    expect(slides[0]?.content[0]).toMatchObject({ type: 'heading' })
    expect(slides[0]?.content[1]).toMatchObject({ type: 'paragraph' })
    expect(slides[1]?.content).toHaveLength(2)
    expect(slides[1]?.content[0]).toMatchObject({ type: 'heading' })
    expect(slides[1]?.content[1]).toMatchObject({ type: 'paragraph' })
  })

  it('extracts a speakerNote in slide 1 into slide1.notes, not content', () => {
    const d = doc(h1('Title'), speakerNote('My note'), p('body'), pageBreak(), p('slide 2'))
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(2)
    expect(slides[0]?.notes).toHaveLength(1)
    expect(slides[0]?.notes[0]).toMatchObject({ type: 'speakerNote' })
    // speakerNote is NOT in content
    expect(
      slides[0]?.content.some((n) => (n as Record<string, unknown>).type === 'speakerNote'),
    ).toBe(false)
    expect(slides[0]?.content).toHaveLength(2) // h1 + paragraph
  })

  it('returns 1 slide with all non-note blocks when there are no pageBreaks', () => {
    const d = doc(h1('Only slide'), p('para 1'), p('para 2'))
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(1)
    expect(slides[0]?.content).toHaveLength(3)
    expect(slides[0]?.notes).toHaveLength(0)
  })

  it('produces an empty slide between consecutive pageBreaks', () => {
    const d = doc(p('before'), pageBreak(), pageBreak(), p('after'))
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(3)
    expect(slides[0]?.content).toHaveLength(1)
    // Middle slide is empty (no content, no notes)
    expect(slides[1]?.content).toHaveLength(0)
    expect(slides[1]?.notes).toHaveLength(0)
    expect(slides[2]?.content).toHaveLength(1)
  })

  it('returns 1 empty slide for an empty doc (no content array)', () => {
    const slides = splitIntoSlides({ type: 'doc' })
    expect(slides).toHaveLength(1)
    expect(slides[0]?.content).toHaveLength(0)
    expect(slides[0]?.notes).toHaveLength(0)
  })

  it('returns 1 empty slide for a null/invalid input', () => {
    expect(splitIntoSlides(null)).toHaveLength(1)
    expect(splitIntoSlides(undefined)).toHaveLength(1)
    expect(splitIntoSlides('not an object')).toHaveLength(1)
    expect(splitIntoSlides(42)).toHaveLength(1)
  })

  it('handles multiple speakerNotes across multiple slides', () => {
    const d = doc(
      h1('S1'),
      speakerNote('note A'),
      speakerNote('note B'),
      pageBreak(),
      h1('S2'),
      speakerNote('note C'),
    )
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(2)
    expect(slides[0]?.notes).toHaveLength(2)
    expect(slides[0]?.content).toHaveLength(1) // just the h1
    expect(slides[1]?.notes).toHaveLength(1)
    expect(slides[1]?.content).toHaveLength(1)
  })

  it('returns 1 slide when doc has only a speakerNote (no pageBreaks)', () => {
    const d = doc(speakerNote('just a note'))
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(1)
    expect(slides[0]?.content).toHaveLength(0)
    expect(slides[0]?.notes).toHaveLength(1)
  })

  it('handles a doc with only a pageBreak (2 empty slides)', () => {
    const d = doc(pageBreak())
    const slides = splitIntoSlides(d)
    expect(slides).toHaveLength(2)
    expect(slides[0]?.content).toHaveLength(0)
    expect(slides[1]?.content).toHaveLength(0)
  })
})
