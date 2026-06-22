// G16: Pure slide-splitting logic — no React, no DOM, no editor deps.
//
// Slides are delimited by top-level `pageBreak` nodes in the ProseMirror doc:
//   • Content before the first pageBreak → slide 1
//   • Content between breaks → subsequent slides
//   • No pageBreaks → the whole doc is one slide
//
// Within each slide's top-level blocks, `speakerNote` nodes are extracted into
// `slide.notes`; all other nodes go into `slide.content`. The speakerNote is
// stripped from display content so it never leaks to the public/share view.
//
// Consecutive pageBreaks produce an empty slide between them (the empty slide
// documents that an intentional blank was placed there — a deliberate v0.1
// choice; authors must remove the duplicate break to collapse it).
//
// Empty doc → always returns an array with exactly 1 empty slide.

export interface Slide {
  content: Record<string, unknown>[]
  notes: Record<string, unknown>[]
}

type RawNode = Record<string, unknown>

/**
 * Split a ProseMirror doc JSON into slides on top-level pageBreak nodes,
 * extracting speakerNote nodes (top-level only) into slide.notes.
 * Always returns ≥1 slide. Pure + deterministic — no side-effects.
 */
export function splitIntoSlides(docJson: unknown): Slide[] {
  // Defensively accept anything; an invalid/null doc → 1 empty slide.
  if (!docJson || typeof docJson !== 'object') {
    return [{ content: [], notes: [] }]
  }

  const doc = docJson as RawNode
  const topContent = doc.content

  if (!Array.isArray(topContent) || topContent.length === 0) {
    return [{ content: [], notes: [] }]
  }

  const slides: Slide[] = []
  let current: Slide = { content: [], notes: [] }

  for (const block of topContent as RawNode[]) {
    if (!block || typeof block !== 'object') continue

    const type = block.type as string | undefined

    if (type === 'pageBreak') {
      // Commit current slide and start a new one.
      slides.push(current)
      current = { content: [], notes: [] }
      continue
    }

    if (type === 'speakerNote') {
      // Extract into notes — never goes into display content.
      current.notes.push(block)
      continue
    }

    current.content.push(block)
  }

  // Always push the last (or only) slide.
  slides.push(current)

  return slides
}
