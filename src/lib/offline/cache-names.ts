// Pure predicates naming the browser storage that belongs to Parchment, so the
// logout cache-clear (clearOfflineCaches) can purge it without a network round
// trip and without touching storage owned by other code. Kept framework-free +
// side-effect-free so the "what do we delete on sign-out" rules are unit-tested.

/**
 * Is this Cache-Storage key one the service worker created? Every SW cache is
 * named `parchment-*` (the version-scoped shell cache, plus the legacy
 * `parchment-v1`), so the prefix is the whole test.
 */
export function isParchmentCacheKey(name: string): boolean {
  return name.startsWith('parchment-')
}

/**
 * Is this IndexedDB database one of the per-doc Yjs stores? y-indexeddb names
 * them `parchment-doc-<docId>` (see Editor.tsx). A bare `parchment-doc-` with no
 * id is not a real store, so require at least one id character after the prefix.
 */
export function isParchmentDocDb(name: string): boolean {
  return name.startsWith('parchment-doc-') && name.length > 'parchment-doc-'.length
}
