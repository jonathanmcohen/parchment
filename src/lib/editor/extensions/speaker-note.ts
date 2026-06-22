// G16: speakerNote — an editable block node for author-visible presenter notes.
//
// The speakerNote node:
//   • is a block node in the 'block' group, holding inline* content (the note text).
//   • renders to <aside data-speaker-note> in the editor (styled muted with a
//     "Speaker note" affordance so the author sees it but knows it is not shown
//     in the reading/share/public view).
//   • renders NULL in render-pm.tsx (the public read-only renderer) — notes
//     NEVER appear in the share/reading view (enforced there, not here).
//   • serializes as a parchment:speakernote fence (lossless markdown round-trip).
//   • parse.ts reconstructs a speakerNote node from that fence.
//
// SCHEMA CONSTRAINT: speakerNote does NOT import any DOM/React at module load so
// getSchema(baseExtensions) still builds in the Next.js server runtime.

import { Node } from '@tiptap/core'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    speakerNote: {
      /** Insert an empty speakerNote block at the current position. */
      insertSpeakerNote: () => ReturnType
    }
  }
}

// ── SpeakerNote node ──────────────────────────────────────────────────────

/**
 * speakerNote — a presenter-only block that holds inline note text.
 *
 * HTML input:  <aside data-speaker-note>…</aside>
 * HTML output: <aside data-speaker-note class="parchment-speaker-note">…</aside>
 *
 * In the editor the node renders with a muted "🎤 Speaker note" label via CSS
 * (see globals.css .parchment-speaker-note::before). In the public read-only
 * render (render-pm.tsx) this node type returns null — it is never displayed.
 */
export const SpeakerNoteExtension = Node.create({
  name: 'speakerNote',

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [{ tag: 'aside[data-speaker-note]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      {
        'data-speaker-note': '',
        class: 'parchment-speaker-note',
        ...HTMLAttributes,
      },
      0,
    ]
  },

  addCommands() {
    return {
      insertSpeakerNote:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'speakerNote' }),
    }
  },
})
