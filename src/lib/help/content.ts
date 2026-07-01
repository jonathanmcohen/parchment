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

// ── Full per-version changelog ────────────────────────────────────────────────

export type ChangelogEntry = {
  version: string
  notes: string[]
}

/** Newest-first changelog. Used by the Parchment Guide “Release notes” doc. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.2.7',
    notes: [
      'Paged layout no longer nudges the left sidebar as you scroll a long, multi-page document — the horizontal scroll for wide pages is isolated to the page area, so the sidebar and toolbar stay put and there is a single scrollbar.',
      'Release notes now refresh on existing installs after an update (not only on a brand-new instance): the in-place “Release notes” guide is regenerated from the current changelog, even when you had opened it before.',
      'Changing the workspace colour scheme (Light / Dark / System) now applies immediately across the app, including already-open editor tabs, without a reload.',
      'Version history (and the comments panel) now stay pinned to the top-right as a sticky side panel, so you can open them from anywhere in a long document without scrolling back up.',
      'Print / Save-as-PDF now matches the on-screen editor: printed pages use the editor’s font and spacing, so line breaks and page breaks line up with what you see while editing.',
      'New fonts picker: search the Google Fonts catalogue and add a font on demand. Chosen fonts are fetched once and self-hosted by your own Parchment server — the browser never loads anything from Google, preserving the “never phones home for a font” guarantee.',
    ],
  },
  {
    version: '0.2.6',
    notes: [
      'Build/CI: the container image security scan now passes reliably. The scan’s report step builds an all-severity SBOM/CVE report for the Security tab, while the pass/fail gate runs separately and fails only on fixed High/Critical findings — previously a mere Medium-severity finding could fail the release even with zero High/Critical. No application change.',
    ],
  },
  {
    version: '0.2.5',
    notes: [
      'Build/CI: the container image security scan now reliably passes. The v0.2.4 image is already clean, but the scan step tripped over the image’s build attestations (SBOM/provenance) when reading the multi-architecture tag; it now scans a specific platform image directly. No application change.',
    ],
  },
  {
    version: '0.2.4',
    notes: [
      'Continuous layout now shows a subtle page indicator: a faint hairline at each page boundary with a small “Page N” label in the margin, so you can tell what page you’re on without the disruptive grey gaps. Paged mode keeps its real sheet gaps.',
      'Single sign-on (OIDC) now accepts identity providers that send a string “true” for email_verified (not only the strict boolean), so account linking works with more providers.',
      'When an SSO sign-in is refused, the login page now explains why (for example, a disabled account, or an unverified email that cannot be linked) instead of a generic “denied”.',
      'Security: the container image no longer bundles the standalone npm CLI (unused at runtime), removing its vendored undici and clearing the last actionable image-scan finding.',
    ],
  },
  {
    version: '0.2.3',
    notes: [
      'Security: updated undici to a patched release (CVE-2026-12151), clearing the last actionable container-image vulnerability.',
    ],
  },
  {
    version: '0.2.2',
    notes: [
      'The “page not found” screen now follows your system light/dark preference instead of always showing a light page.',
      'Smaller, leaner container image: the runner now ships only production dependencies, and the vulnerability scan ignores base-OS issues with no available fix so it flags only actionable ones.',
      'Security: updated lodash-es to a patched release (CVE-2026-4800).',
    ],
  },
  {
    version: '0.2.1',
    notes: [
      'Paged layout now paginates the live editor as you type: content fills each page and breaks at a block boundary onto a new sheet, with a real page gutter, sheet shadows, and preserved top/bottom margins — instead of one continuous canvas. Themes correctly in both light and dark page modes (completing the Paged-mode note from v0.1.10, which was preview/print-only).',
      'An image, table, or code block taller than a page gets its own page rather than being cut; manual page breaks start a new sheet. The document itself is never split — pagination is purely visual, so collaboration and the Markdown mirror are unaffected.',
    ],
  },
  {
    version: '0.2.0',
    notes: [
      'Collaboration: threaded comments anchored to a selection that survive concurrent edits (durable Yjs anchors), resolve, and @mention notifications; orphaned comments are kept in their own group when the anchored text is deleted.',
      'Suggestion mode hardening: paste-over, cut, and whole-block deletions are now tracked changes (no silent loss), and accept/reject converges correctly when two people edit at once.',
      'Publish to web: a read-only public page (reusing the share renderer) that can show comments read-only.',
      'Share links now carry a permission level (view / comment / edit) and an optional expiry, enforced on the server every request — a view link cannot comment or edit, and an expired link is dead everywhere including live collaboration.',
      'Real-time presence: avatars of who is editing or viewing a document, with live cursors.',
      'Security: the real-time collaboration server now authenticates every connection and is bound to localhost only — unauthorized, view-only, expired, and wrong-document connections are refused.',
    ],
  },
  {
    version: '0.1.11',
    notes: [
      'Fixed the slash, wiki-link, and citation menus rendering behind code blocks and the table of contents — they now always appear on top.',
    ],
  },
  {
    version: '0.1.10',
    notes: [
      'Legible PDF/print in dark mode — printed pages are now always black-on-white regardless of your theme — and the editor toolbar/header stays pinned while you scroll long documents.',
      'Accessibility: High Contrast no longer renders document text invisibly (white-on-white) on light or sepia pages.',
      'Dark-mode consistency sweep: embed/diagram/citation cards, admin status colours, code-block diff tints, table/checkbox/table-of-contents accents, and scrollbars all adapt to dark mode; theme and page-background changes now apply instantly without a reload.',
      'Syntax-highlighted code blocks in PDF/print exports.',
      'Real content-split page sheets with per-page orientation in print/preview, plus native PDF printing (the unreliable paged.js engine was removed). Note: the live editor’s Paged mode stays continuous and per-page orientation is preview/print-only this release.',
    ],
  },
  {
    version: '0.1.9',
    notes: [
      'Reliability + polish pass: overlay/dropdown/tooltip fixes, single-scroll editor with sticky chrome, instant theme/style changes, selectable light/dark page with consistent legibility, working Trash, fixed PDF export, smarter code-block language detection, and this full changelog.',
    ],
  },
  {
    version: '0.1.8',
    notes: [
      'Title renames appear in the file list immediately on client-side navigation, no reload.',
    ],
  },
  {
    version: '0.1.7',
    notes: [
      'System-dark active-item contrast fix.',
      'Right-edge dropdowns no longer open off-screen.',
      'Rename via Server Action.',
      'Code blocks auto-detect language on edit.',
      'Code-block delete button.',
      'HTML export with syntax highlighting.',
    ],
  },
  {
    version: '0.1.6',
    notes: [
      'New Parchment logo (favicon + app icon).',
      'One-row toolbar that never scrolls.',
      'Instant title renames across the file list.',
    ],
  },
  {
    version: '0.1.5',
    notes: [
      'Full-width toolbar with a ⋯ overflow menu.',
      'Legible code blocks in dark mode.',
      'Consistent System theme.',
      'Paged layout option.',
      'About moved into Settings.',
      'Broad dark-mode + UI polish sweep.',
    ],
  },
  {
    version: '0.1.4',
    notes: [
      'Account-level theme save.',
      'Dark-mode slash/wiki/cite menus.',
      'Account name & language persistence.',
      'Password-change hardening.',
      'Runtime collab URL.',
      'No editor hydration error.',
      'Tighter editor top bar.',
    ],
  },
  {
    version: '0.1.3',
    notes: [
      'Live-deploy fixes + a Google-Docs layout sweep (theme save, share links, settings, sidebar/status/editor spacing).',
    ],
  },
  {
    version: '0.1.2',
    notes: ['Function-gap fixes + Google-Docs layout + chrome polish.'],
  },
  {
    version: '0.1.1',
    notes: ['Visual-parity sweep toward the Google-Docs look.'],
  },
  {
    version: '0.1.0',
    notes: [
      'First release: collaborative Tiptap+Yjs editor, disk-mirror Markdown, five themes, slash/wiki/cite menus + command palette, presenter mode, export to Markdown/HTML/DOCX/EPUB, public + password-protected sharing.',
    ],
  },
]

// CHANGELOG is non-empty by construction; the non-null assertion is safe.
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const RELEASE_NOTES: ReleaseNotes = {
  version: APP_VERSION,
  // biome-ignore lint/style/noNonNullAssertion: CHANGELOG always has at least one entry
  highlights: CHANGELOG[0]!.notes,
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
    title: 'Collaboration',
    body: 'Work together in real time: see who is editing or viewing, leave threaded comments anchored to the text (they follow it as the document changes), and @mention someone to notify them. Turn on Suggesting mode to propose tracked changes a reviewer can accept or reject. Share a document with a view, comment, or edit link — with an optional expiry — or publish a read-only page to the web.',
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
