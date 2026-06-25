// Regenerate the PWA icons from the Parchment brand mark (the parchment scroll).
// Source of truth is the same artwork as src/app/icon.svg + the ParchmentLogo
// component. Run: `node scripts/gen-icons.mjs` (re-run whenever the mark changes).
//
// sharp is a transitive dep (via Next), so it is not symlinked to node_modules/.
// Resolve it from the pnpm store; fall back to a bare require if hoisted.
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let sharp
try {
  sharp = require('sharp')
} catch {
  const p = execSync('find node_modules/.pnpm -maxdepth 4 -name sharp -type d | head -1', {
    cwd: root,
  })
    .toString()
    .trim()
  sharp = require(resolve(root, p))
}

// The scroll artwork (matches src/app/icon.svg + ParchmentLogo.tsx).
const scroll = `
  <path d="M32 30 q0 -8 8 -8 h28 q-6 4 -6 12 v44 q0 8 -8 8 h-28 q6 -4 6 -12 Z" fill="#ffffff"/>
  <path d="M62 22 q8 0 8 8 v40 q0 8 -8 8" fill="none" stroke="#aecbfa" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="38" y="40" width="20" height="4" rx="2" fill="#1A73E8"/>
  <rect x="38" y="50" width="20" height="4" rx="2" fill="#1A73E8"/>
  <rect x="38" y="60" width="13" height="4" rx="2" fill="#8ab4f8"/>`

// Standard ("any" purpose): rounded-tile mark, used for the 192/512 icons.
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="2" y="2" width="96" height="96" rx="22" fill="#1A73E8"/>${scroll}
</svg>`

// Maskable: full-bleed blue (no rounded corners — the OS applies the mask) with
// the scroll scaled into the center ~66% safe zone so a circle/squircle mask
// never crops it.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1A73E8"/>
  <g transform="translate(17 17) scale(0.66)">${scroll}</g>
</svg>`

const out = resolve(root, 'public/icons')
const jobs = [
  { svg: standardSvg, size: 192, file: 'icon-192.png' },
  { svg: standardSvg, size: 512, file: 'icon-512.png' },
  { svg: maskableSvg, size: 512, file: 'icon-maskable-512.png' },
]

for (const { svg, size, file } of jobs) {
  await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(resolve(out, file))
  console.log(`wrote public/icons/${file} (${size}x${size})`)
}
