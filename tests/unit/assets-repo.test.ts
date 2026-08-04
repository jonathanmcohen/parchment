import { describe, expect, it } from 'vitest'
import { relPathIfManaged } from '@/lib/disk/reverse-sync'
import { sha256Hex } from '@/lib/uploads/assets-repo'

// v0.2.12: DB-backed assets. These are the pure parts — the digest helper and the
// reverse-sync exclusion that keeps asset sync one-directional.

describe('sha256Hex', () => {
  it('produces a stable 64-char hex digest', () => {
    const d = sha256Hex(new Uint8Array([1, 2, 3]))
    expect(d).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex(new Uint8Array([1, 2, 3]))).toBe(d)
  })

  it('differs for different bytes', () => {
    expect(sha256Hex(new Uint8Array([1]))).not.toBe(sha256Hex(new Uint8Array([2])))
  })

  it('handles empty input', () => {
    expect(sha256Hex(new Uint8Array([]))).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('relPathIfManaged rejects asset paths', () => {
  // Derive the root the same way lib/env does, rather than assuming one - the
  // default is HOME-relative, so a hardcoded '/data/files' silently fails.
  const root = process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`

  it('rejects the legacy top-level .assets tree', () => {
    expect(relPathIfManaged(`${root}/.assets/abc/pic.png`)).toBeNull()
  })

  it('rejects the v0.2.12 sibling <DocName>.assets/ folders', () => {
    // This is the load-bearing case: the mirror writes images here, and an image
    // must never be read back as an edited document.
    expect(relPathIfManaged(`${root}/Welcome.assets/diagram.png`)).toBeNull()
    expect(relPathIfManaged(`${root}/Guide/Welcome.assets/diagram.png`)).toBeNull()
  })

  it('still accepts an ordinary managed markdown file', () => {
    expect(relPathIfManaged(`${root}/Guide/Welcome.md`)).toBe('Guide/Welcome.md')
  })

  it('does not reject a document merely containing the word assets', () => {
    expect(relPathIfManaged(`${root}/my assets list.md`)).toBe('my assets list.md')
  })
})
