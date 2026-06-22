// Pure builder — no server/browser imports; fully unit-testable.

export interface MenuItem {
  key: string
  label: string
  enabled: boolean
  note?: string
}

/** The ordered context-menu items for a doc. `starred` flips the star label. */
export function docMenuItems(opts: { starred: boolean }): MenuItem[] {
  return [
    { key: 'open', label: 'Open', enabled: true },
    { key: 'rename', label: 'Rename', enabled: true },
    { key: 'duplicate', label: 'Duplicate', enabled: true },
    {
      key: 'star',
      label: opts.starred ? 'Unstar' : 'Star',
      enabled: true,
    },
    { key: 'export-md', label: 'Export as Markdown', enabled: true },
    { key: 'show-in-folder', label: 'Show in folder', enabled: true },
    {
      key: 'template',
      label: 'Save as template',
      enabled: true,
    },
    {
      key: 'share',
      label: 'Share',
      enabled: false,
      note: 'Sharing arrives in v0.2',
    },
    { key: 'trash', label: 'Move to Trash', enabled: true },
  ]
}
