import 'server-only'
import { getSetting, setSetting } from '@/lib/docs/settings-repo'
import { normalizeDict, normalizeWord } from '@/lib/integrations/dictionary'

// K7: per-owner custom dictionary, stored in the E11 settings key-value store
// (NO migration — it is just another settings key holding a string[]). Words are
// normalized (trim + lower-case + length-cap) and deduped on every read AND
// write so the stored value is always canonical and bounded (MAX_DICT_WORDS).

/** Settings key holding the owner's custom-dictionary word list. */
export const CUSTOM_DICT_KEY = 'customDictionary'

/** Read the owner's custom dictionary (normalized + deduped; [] when unset). */
export async function getCustomDict(ownerId: string): Promise<string[]> {
  const raw = await getSetting<unknown>(ownerId, CUSTOM_DICT_KEY, [])
  return normalizeDict(raw)
}

/**
 * Add `word` to the owner's custom dictionary (normalized; deduped; capped).
 * Returns the updated list. A blank/normalize-to-empty word is a no-op.
 */
export async function addDictWord(ownerId: string, word: unknown): Promise<string[]> {
  const w = normalizeWord(word)
  if (w === '') return getCustomDict(ownerId)
  const current = await getCustomDict(ownerId)
  if (current.includes(w)) return current
  const next = normalizeDict([...current, w])
  await setSetting(ownerId, CUSTOM_DICT_KEY, next)
  return next
}

/**
 * Remove `word` from the owner's custom dictionary (case-insensitive match).
 * Returns the updated list (unchanged when the word was not present).
 */
export async function removeDictWord(ownerId: string, word: unknown): Promise<string[]> {
  const w = normalizeWord(word)
  if (w === '') return getCustomDict(ownerId)
  const current = await getCustomDict(ownerId)
  const next = current.filter((entry) => entry !== w)
  if (next.length === current.length) return current
  await setSetting(ownerId, CUSTOM_DICT_KEY, next)
  return next
}
