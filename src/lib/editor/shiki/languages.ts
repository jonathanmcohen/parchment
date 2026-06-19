/**
 * Language helpers for Shiki code-block highlighting (C3/C4).
 *
 * Canonical lang ids match the filenames in shiki's bundled langs directory.
 * We expose the ~50 most-common ones and provide a normalizer for common aliases
 * (ts → typescript, py → python, …) so legacy/informal lang tags work too.
 */

// ── Top-50 bundled languages ───────────────────────────────────────────────

export const TOP_LANGUAGES: string[] = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'scala',
  'bash',
  'sql',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'toml',
  'markdown',
  'xml',
  'dockerfile',
  'makefile',
  'lua',
  'r',
  'perl',
  'haskell',
  'elixir',
  'erlang',
  'clojure',
  'fsharp',
  'powershell',
  'vim',
  'diff',
  'graphql',
  'solidity',
  'zig',
  'nim',
  'crystal',
  'julia',
  'matlab',
  'ocaml',
  'purescript',
  'dart',
  'elm',
  'coffeescript',
  'groovy',
]

// ── Alias map ───────────────────────────────────────────────────────────────

/**
 * Map informal / short aliases to canonical Shiki lang ids.
 * Keys are lowercased before lookup — no need to duplicate casing variants.
 */
const ALIAS_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  rb: 'ruby',
  hs: 'haskell',
  pl: 'perl',
  fs: 'fsharp',
  ps1: 'powershell',
  ps: 'powershell',
  kt: 'kotlin',
  kts: 'kotlin',
  tf: 'hcl',
  jl: 'julia',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  ml: 'ocaml',
}

// ── Public helpers ──────────────────────────────────────────────────────────

/**
 * Normalize an informal or alias lang string to a canonical Shiki lang id.
 * Returns 'plaintext' for null/undefined/empty/unknown inputs.
 */
export function normalizeLang(input: string | null | undefined): string {
  if (!input) return 'plaintext'
  const lower = input.toLowerCase().trim()
  if (!lower) return 'plaintext'
  // Exact alias match
  const aliased = ALIAS_MAP[lower]
  if (aliased !== undefined) return aliased
  // Already a canonical supported lang
  if (TOP_LANGUAGES.includes(lower)) return lower
  // Unknown
  return 'plaintext'
}

/**
 * Returns true if the lang is one we can actually highlight with Shiki.
 * 'plaintext' is intentionally excluded — it means "no highlighting".
 */
export function isSupportedLanguage(lang: string): boolean {
  return TOP_LANGUAGES.includes(lang)
}
