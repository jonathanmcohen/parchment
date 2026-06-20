// F2: shared sha256 helper for the disk-sync baseline hashes. No fs/db/React.
import { createHash } from 'node:crypto'

/** Hex sha256 of a UTF-8 string. */
export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}
