'use client'

import type { Editor } from '@tiptap/core'
import { dispatchShortcut } from '@/components/shortcuts/GlobalShortcuts'
import {
  copySelection,
  cutSelection,
  pasteFromClipboard,
  pasteWithoutFormatting,
} from './clipboard-actions'
import { Menu, type MenuItemConfig } from './menus/Menu'

// S3-2 + F10: the editor menu bar (File · Edit · View · Insert · Format · Tools ·
// Help). Every visible row re-surfaces an EXISTING handler on Editor.tsx / the
// TipTap editor (no new feature logic). F10 removed the remaining "coming soon"
// placeholder rows (unbacked features that won't ship in v0.1.2) — including the
// whole Extensions menu, which held only placeholders — so no visibly-disabled
// placeholder row remains in any menu.
//
// Each <Menu> consumes the shared accessible primitive (menus/Menu.tsx), which
// styles its panel with the `.px-menu` shell + the S1 `--shadow-dropdown` token
// (DECISION 6). No second dropdown component exists.

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
    {
      label: 'Cut',
      icon: 'content_cut',
      shortcut: '⌘X',
      onSelect: () => cutSelection(editor),
    },
    {
      label: 'Copy',
      icon: 'content_copy',
      shortcut: '⌘C',
      onSelect: () => copySelection(editor),
    },
    {
      label: 'Paste',
      icon: 'content_paste',
      shortcut: '⌘V',
      onSelect: () => pasteFromClipboard(editor),
    },
    {
      label: 'Paste without formatting',
      shortcut: '⌘⇧V',
      onSelect: () => pasteWithoutFormatting(editor),
    },
    { kind: 'separator' },
    { label: 'Select all', shortcut: '⌘A', onSelect: () => editor.commands.selectAll() },
    { kind: 'separator' },
    { label: 'Find', icon: 'search', shortcut: '⌘F', onSelect: () => openFind('find') },
    { label: 'Find and replace', shortcut: '⌘⇧H', onSelect: () => openFind('replace') },
  ]

  const viewMenu: MenuItemConfig[] = [
    { label: 'Show outline', icon: 'toc', onSelect: onToggleOutline },
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
    {
      label: 'Horizontal line',
      icon: 'horizontal_rule',
      onSelect: () => editor.chain().focus().setHorizontalRule().run(),
    },
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
  ]

  const toolsMenu: MenuItemConfig[] = [
    { label: 'Word count', icon: 'functions', onSelect: onOpenWordCount },
    ...(grammarEnabled && onToggleGrammar
      ? [{ label: 'Grammar suggestions', icon: 'spellcheck', onSelect: onToggleGrammar }]
      : []),
  ]

  const helpMenu: MenuItemConfig[] = [
    {
      label: "What's new",
      icon: 'tips_and_updates',
      href: '/whats-new',
    },
    { kind: 'separator' },
    {
      label: 'Keyboard shortcuts',
      icon: 'keyboard',
      // F10: the global cheat-sheet action is owned by the HelpMenu (mounted in
      // the app layout, registers `shortcuts-help`). Dispatch the same action the
      // ⌘⇧/ chord fires so there is ONE owner of the shortcuts modal.
      onSelect: () => dispatchShortcut('shortcuts-help'),
    },
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
        <Menu label="Help" items={helpMenu} />
      </div>
    </nav>
  )
}
