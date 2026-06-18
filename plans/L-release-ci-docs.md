# Plan L — Release / CI / docs

One image, one tag `v0.1.0`. Mirrors Cairn's release machinery.

- **L1** Multi-arch Docker `ghcr.io/jonathanmcohen/parchment:v0.1.0` (amd64 + arm64), built on GH-hosted runners.
- **L2** GH Actions release pipeline mirrors Cairn: `release.yml` with `verify-carry-forward-closed`, per-PR artifact requirements, tag job gated on **green e2e + a11y**.
- **L3** `release/v0.1.0` integration branch; per-item PR squash → tag → publish. **One PR per item. Keep the branch** after tag (no cleanup — user decision).

## Branch model

- **`main`** = stable trunk. Holds released code only. Never receives feature work directly.
- **`release/v0.1.0`** = integration branch. ALL Plan A–L work lands here (one squashed PR per item).
- **At release:** once the tag job is green (e2e + axe), merge `release/v0.1.0` → `main`, then tag `v0.1.0` on `main`, build + publish the image, and **keep** the release branch.
- `main` stays a strict ancestor of the release branch during development, so the final merge is clean (fast-forward or a single `--no-ff` merge commit). Next cycle branches `release/v0.2.0` off `main`.
- **L4** README: install, env vars, commands, upgrade flow.
- **L5** In-app "What's new in v0.1.0" release-notes page (Cairn drawer + Guide structure).
- **L6** `Parchment Guide` workspace seed: per-feature page tree + release-notes parent (mirror Cairn Guide build).

## Per-PR artifacts (all five, enforced by L2)
1. spec path
2. RED-on-main (failing test before impl)
3. GREEN-on-branch (passing after impl)
4. live-deploy screenshot
5. axe-core zero-violations report on the affected route

## Release discipline (from saved feedback)
- Plan executed on `release/v0.1.0` branch, single image out.
- Pin newest stable for every tool/dep; spec floors are minimums.
