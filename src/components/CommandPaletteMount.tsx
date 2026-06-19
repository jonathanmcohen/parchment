'use client'

import { CommandPalette } from './CommandPalette'
import { FileFinder } from './FileFinder'

export function CommandPaletteMount() {
  return (
    <>
      <CommandPalette />
      <FileFinder />
    </>
  )
}
