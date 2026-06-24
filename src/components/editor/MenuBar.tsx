'use client'

import type { Editor } from '@tiptap/core'
import { Menu, type MenuItemConfig } from './menus/Menu'

// S3-2: the editor menu bar (File · Edit · View · Insert · Format · Tools ·
// Extensions · Help). PARTIAL by design — every NON-placeholder row re-surfaces
// an EXISTING handler on Editor.tsx / the TipTap editor (no new feature logic);
// rows with no backing action ship as visibly-disabled "coming soon"
// placeholders (placeholder honesty, finding #21). The shipped-vs-placeholder
// split is recorded in scope.md.
//
// Each <Menu> consumes the shared accessible primitive (menus/Menu.tsx), which
// styles its panel with the `.px-menu` shell + the S1 `--shadow-dropdown` token
// (DECISION 6). No second dropdown component exists.

const COMING_SOON = 'Coming soon'

export type MenuBarHandlers = {
  editor: Editor
  docId: string
  onToggleVersionHistory: () => void
  onOpenPageSetup: () => void
  onExportPdf: () => void
  onInsertImage: () => void
  onOpenLink: () => void
  onToggleComments: () => void
  openFind: (mode: 'find' | 'replace') => void
  onToggleOutline: () => void
  onOpenWordCount: () => void
  onToggleGrammar?: () => void
  grammarEnabled?: boolean
}

function placeholder(label: string): MenuItemConfig {
  return { label, disabled: true, hint: COMING_SOON }
}

export function MenuBar(props: MenuBarHandlers) {
  const {
    editor,
    docId,
    onToggleVersionHistory,
    onOpenPageSetup,
    onExportPdf,
    onInsertImage,
    onOpenLink,
    onToggleComments,
    openFind,
    onToggleOutline,
    onOpenWordCount,
    onToggleGrammar,
    grammarEnabled,
  } = props

  const exportRows: MenuItemConfig[] = (
    [
      { label: 'Markdown (.md)', format: 'md' },
      { label: 'HTML (.html)', format: 'html' },
      { label: 'Plain text (.txt)', format: 'txt' },
      { label: 'Word (.docx)', format: 'docx' },
      { label: 'EPUB (.epub)', format: 'epub' },
      { label: 'LaTeX (.tex)', format: 'tex' },
    ] as const
  ).map(({ label, format }) => ({
    label,
    href: `/api/docs/${docId}/export?format=${format}`,
    download: true,
  }))

  const fileMenu: MenuItemConfig[] = [
    { label: 'Version history', icon: 'history', onSelect: onToggleVersionHistory },
    {
      kind: 'submenu',
      label: 'Download',
      items: [...exportRows, { label: 'PDF', onSelect: onExportPdf }],
    },
    { label: 'Page setup', icon: 'settings_overscan', onSelect: onOpenPageSetup },
    { label: 'Print', icon: 'print', onSelect: onExportPdf, shortcut: '⌘P' },
    { kind: 'separator' },
    placeholder('New'),
    placeholder('Open'),
    placeholder('Make a copy'),
    placeholder('Move'),
    placeholder('Move to trash'),
    placeholder('Email'),
  ]

  const editMenu: MenuItemConfig[] = [
    {
      label: 'Undo',
      icon: 'undo',
      shortcut: '⌘Z',
      onSelect: () => editor.chain().focus().undo().run(),
    },
    {
      label: 'Redo',
      icon: 'redo',
      shortcut: '⌘Y',
      onSelect: () => editor.chain().focus().redo().run(),
    },
    { kind: 'separator' },
    { label: 'Select all', shortcut: '⌘A', onSelect: () => editor.commands.selectAll() },
    { kind: 'separator' },
    { label: 'Find', icon: 'search', shortcut: '⌘F', onSelect: () => openFind('find') },
    { label: 'Find and replace', shortcut: '⌘⇧H', onSelect: () => openFind('replace') },
  ]

  const viewMenu: MenuItemConfig[] = [
    { label: 'Show outline', icon: 'toc', onSelect: onToggleOutline },
    { kind: 'separator' },
    placeholder('Print layout'),
    placeholder('Pageless'),
    placeholder('Show ruler'),
    placeholder('Full screen'),
  ]

  const insertMenu: MenuItemConfig[] = [
    { label: 'Image', icon: 'image', onSelect: onInsertImage },
    {
      label: 'Table',
      icon: 'table',
      onSelect: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    { label: 'Link', icon: 'link', onSelect: onOpenLink },
    { label: 'Comment', icon: 'comment', onSelect: onToggleComments },
    { kind: 'separator' },
    {
      label: 'Table of contents',
      icon: 'format_list_numbered',
      onSelect: () => editor.chain().focus().insertToc().run(),
    },
    {
      label: 'Footnote',
      onSelect: () => editor.chain().focus().insertFootnote().run(),
    },
    {
      label: 'Page break',
      onSelect: () => editor.chain().focus().insertPageBreak().run(),
    },
    { kind: 'separator' },
    placeholder('Chart'),
    placeholder('Special characters'),
    placeholder('Headers & footers'),
  ]

  const formatMenu: MenuItemConfig[] = [
    {
      label: 'Bold',
      icon: 'format_bold',
      shortcut: '⌘B',
      onSelect: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: 'format_italic',
      shortcut: '⌘I',
      onSelect: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      icon: 'format_underlined',
      shortcut: '⌘U',
      onSelect: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Strikethrough',
      onSelect: () => editor.chain().focus().toggleStrike().run(),
    },
    { kind: 'separator' },
    {
      label: 'Clear formatting',
      icon: 'format_clear',
      onSelect: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    { kind: 'separator' },
    placeholder('Columns'),
    placeholder('Page numbers'),
  ]

  const toolsMenu: MenuItemConfig[] = [
    { label: 'Word count', icon: 'functions', onSelect: onOpenWordCount },
    ...(grammarEnabled && onToggleGrammar
      ? [{ label: 'Grammar suggestions', icon: 'spellcheck', onSelect: onToggleGrammar }]
      : []),
    { kind: 'separator' },
    placeholder('Spell check'),
    placeholder('Personal dictionary'),
    placeholder('Translate document'),
  ]

  const extensionsMenu: MenuItemConfig[] = [placeholder('Add-ons'), placeholder('Apps Script')]

  const helpMenu: MenuItemConfig[] = [
    {
      label: "What's new",
      icon: 'tips_and_updates',
      href: '/whats-new',
    },
    { kind: 'separator' },
    placeholder('Keyboard shortcuts'),
    placeholder('Replay tour'),
    placeholder('About Parchment'),
  ]

  return (
    // L2: the <nav> is the full-bleed bg/border/sticky box; the inner
    // .parchment-menubar-inner re-centers the menu items at the body max-width.
    <nav className="parchment-menubar" aria-label="Editor menu bar">
      <div className="parchment-menubar-inner mx-auto max-w-5xl">
        <Menu label="File" items={fileMenu} />
        <Menu label="Edit" items={editMenu} />
        <Menu label="View" items={viewMenu} />
        <Menu label="Insert" items={insertMenu} />
        <Menu label="Format" items={formatMenu} />
        <Menu label="Tools" items={toolsMenu} />
        <Menu label="Extensions" items={extensionsMenu} />
        <Menu label="Help" items={helpMenu} />
      </div>
    </nav>
  )
}
