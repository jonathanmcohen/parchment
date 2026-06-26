// L6: first-run "Parchment Guide" content. PURE data — no db/React imports — so
// it is importable from both the server (seedGuideWorkspace) and from unit tests
// without touching Postgres. `content` is ProseMirror `doc` JSON matching the
// editor schema (doc/paragraph/heading{level}/bulletList/listItem/text — see
// src/lib/editor/tiptap-extensions.ts), exactly like src/lib/docs/builtin-templates.ts.
// seedGuideWorkspace passes each doc's `content` straight to createDocument, so
// the guide lands disk-mirrored + searchable + markdown-projected like any doc.

import { CHANGELOG, RELEASE_NOTES } from '@/lib/help/content'

/** A ProseMirror document node, minimal but real (same shape as builtin-templates). */
export interface ProseMirrorDoc {
  type: 'doc'
  content: Record<string, unknown>[]
}

export interface GuideDoc {
  /** Stable key — useful for tests + ordering; not persisted. */
  key: string
  title: string
  content: ProseMirrorDoc
}

// ─── Node builders (keep the literals below readable + valid) ─────────────────

function text(value: string): Record<string, unknown> {
  return { type: 'text', text: value }
}

function paragraph(value?: string): Record<string, unknown> {
  return value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' }
}

function heading(level: number, value: string): Record<string, unknown> {
  return { type: 'heading', attrs: { level }, content: [text(value)] }
}

function bullets(...items: string[]): Record<string, unknown> {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  }
}

// ─── Folder ───────────────────────────────────────────────────────────────────

/** The folder the guide docs live in. */
export const GUIDE_FOLDER_NAME = 'Parchment Guide'

// ─── The guide docs ────────────────────────────────────────────────────────────

/** Release-notes doc body: renders the full CHANGELOG, newest version first. */
function releaseNotesDoc(): ProseMirrorDoc {
  const entries: Record<string, unknown>[] = []
  for (const entry of CHANGELOG) {
    entries.push(heading(2, `v${entry.version}`))
    entries.push(bullets(...entry.notes))
  }
  return {
    type: 'doc',
    content: [
      heading(1, 'Release notes'),
      paragraph(
        "What's changed in each version of Parchment. You can always re-read these from the Help menu or the What's new page.",
      ),
      ...entries,
    ],
  }
}

export const GUIDE_DOCS: readonly GuideDoc[] = [
  {
    key: 'welcome',
    title: 'Welcome to Parchment',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Welcome to Parchment'),
        paragraph(
          'Parchment is a self-hostable, Google-Docs-style writing app that keeps every document as a plain Markdown file on your own disk. You own your data, and you can use git or any text editor alongside it.',
        ),
        heading(2, 'What makes it different'),
        bullets(
          'Markdown-first: each doc is mirrored to a real .md file on disk, git-tracked and portable.',
          'Real-time collaboration powered by Tiptap and Yjs, with presence cursors.',
          'Self-hosted in a single all-in-one container — no external services required.',
        ),
        heading(2, 'Where to go next'),
        paragraph(
          'Read the other docs in this guide to learn the editor, sharing and export, and how to wire up optional integrations. When you are ready, head to the Files page and create your first document.',
        ),
      ],
    },
  },
  {
    key: 'editor',
    title: 'The editor & slash menu',
    content: {
      type: 'doc',
      content: [
        heading(1, 'The editor & slash menu'),
        paragraph(
          'The editor is a rich, page-bounded canvas. Most formatting is available from the toolbar, the bubble menu on a selection, or by typing Markdown shortcuts directly.',
        ),
        heading(2, 'The slash menu'),
        paragraph(
          'At the start of an empty line, type / to open the slash menu. It inserts blocks such as headings, lists, tables, code blocks, math, and diagrams.',
        ),
        heading(2, 'Handy shortcuts'),
        bullets(
          '⌘K opens the command palette; ⌘P is the fuzzy file finder.',
          'Type [[ to insert a wiki link to another document.',
          'Type @ to insert a citation or mention.',
          'Press F5 to enter or exit presenter mode.',
        ),
        paragraph('Open the Help menu in the sidebar for the full keyboard-shortcut reference.'),
      ],
    },
  },
  {
    key: 'sharing-export',
    title: 'Sharing & export',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Sharing & export'),
        heading(2, 'Sharing a document'),
        paragraph(
          'Any document can be shared with a public read-only link. Links can be password-protected, and trashing a document immediately revokes its share links.',
        ),
        heading(2, 'Exporting'),
        paragraph(
          'Export a document to any of these formats whenever you need to send it elsewhere:',
        ),
        bullets('Markdown', 'HTML', 'DOCX (Word)', 'EPUB'),
        heading(2, 'Importing'),
        paragraph(
          'You can import existing content from Markdown and DOCX files — useful for migrating notes into Parchment.',
        ),
      ],
    },
  },
  {
    key: 'settings-integrations',
    title: 'Settings & integrations',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Settings & integrations'),
        paragraph(
          'Open Settings from the sidebar to manage your account, workspace theme, and integrations. Most integrations are optional and off by default — Parchment works fully without any of them.',
        ),
        heading(2, 'Appearance'),
        paragraph(
          'Choose from five built-in themes (paper, slate, forest, ocean, rose), or apply custom CSS per document.',
        ),
        heading(2, 'Optional integrations'),
        bullets(
          'AI compose — point it at an OpenAI-compatible endpoint to enable AI writing actions.',
          'Semantic search — set an embeddings endpoint to enable similarity search.',
          'Diagrams — configure PlantUML and draw.io servers for richer diagram editing.',
          'Grammar — connect a LanguageTool instance for grammar checking.',
          'Backups — configure S3-compatible storage for off-site backups.',
        ),
        paragraph(
          'See the README for the full environment-variable reference and what each integration enables.',
        ),
      ],
    },
  },
  {
    key: 'release-notes',
    title: `Release notes — v${RELEASE_NOTES.version}`,
    content: releaseNotesDoc(),
  },
] as const

/** The expected guide doc titles, in order. Used by the seed + its tests. */
export const GUIDE_DOC_TITLES: readonly string[] = GUIDE_DOCS.map((d) => d.title)
