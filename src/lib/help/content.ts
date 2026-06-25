// Pure data — no React, no side effects. Imported by HelpMenu (client island)
// and by unit tests. I2 will make shortcuts customizable; v0.1 is a static
// reference list authored here.

import { APP_VERSION } from '@/lib/version'

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

export type Shortcut = {
  keys: string
  label: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: '⌘K', label: 'Open command palette' },
  { keys: '⌘P', label: 'Fuzzy file finder' },
  { keys: '⌘B', label: 'Bold' },
  { keys: '⌘I', label: 'Italic' },
  { keys: '⌘U', label: 'Underline' },
  { keys: '⌘S', label: 'Note (autosaves continuously)' },
  { keys: 'F5', label: 'Enter / exit presenter mode' },
  { keys: '/', label: 'Open slash-command menu (at line start)' },
  { keys: '[[', label: 'Insert wiki link' },
  { keys: '@', label: 'Insert citation / @-mention' },
  { keys: '⌘Z', label: 'Undo' },
  { keys: '⌘⇧Z', label: 'Redo' },
  { keys: '⌘\\', label: 'Clear formatting' },
  { keys: 'Tab', label: 'Indent list item' },
  { keys: '⇧Tab', label: 'Outdent list item' },
]

// ── Release notes ─────────────────────────────────────────────────────────────

export type ReleaseNotes = {
  version: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseNotes = {
  version: APP_VERSION,
  highlights: [
    'Reliability + polish: dark-mode slash/wiki/cite menus, Account name & language now save, password-change hardening, runtime collab URL, no editor hydration error, tighter editor top bar',
    'Live-deploy fixes + a full Google-Docs layout sweep (theme save, share links, settings, sidebar/status/editor spacing)',
    'Google Docs-style interface — full-width chrome, anchored outline, centered page, and a polished light/dark theme',
    'Rich collaborative editor powered by Tiptap + Yjs — real-time co-editing with presence cursors',
    'Disk-mirror: every document is a Markdown file on disk, git-tracked and portable',
    'Diagrams, math (LaTeX), and citations built in — Mermaid, draw.io, PlantUML, KaTeX',
    'Export to Markdown, HTML, DOCX, and EPUB; import from Markdown and DOCX',
    'Sharing with public read-only links and password-protected views',
    'Five built-in themes (paper, slate, forest, ocean, rose) plus custom CSS per document',
    'Slash-command menu, wiki links [[ ]], @-citations, and a command palette (⌘K)',
    'Presenter mode (F5) with speaker notes and keyboard navigation',
  ],
}

// ── Tour steps ────────────────────────────────────────────────────────────────

export type TourStep = {
  title: string
  body: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Parchment',
    body: 'Parchment is a self-hosted writing app that keeps every document as a plain Markdown file on your disk — so you always own your data and can use any text editor or git alongside it.',
  },
  {
    title: 'The editor',
    body: 'Write in a rich editor with real-time collaboration, diagrams (Mermaid, draw.io), math (LaTeX), citations, and more. Use ⌘K to open the command palette or / to insert blocks.',
  },
  {
    title: 'The file manager',
    body: 'Browse, search, and organise your documents from the Files page. Folders, tags, smart folders, and full-text search keep large note libraries manageable.',
  },
  {
    title: 'Sharing & export',
    body: 'Share any document with a public or password-protected link. Export to Markdown, DOCX, HTML, or EPUB whenever you need to send your work somewhere else.',
  },
  {
    title: 'Settings & themes',
    body: 'Head to Settings to choose a theme, manage your workspace, and configure integrations. The Help menu (bottom-left) is always here if you need a keyboard-shortcut reference or want to replay this tour.',
  },
]
