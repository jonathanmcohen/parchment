# Releasing Parchment

This is the end-to-end release process for Parchment. It is deliberately a
**carry-forward-closed** flow (mirroring the Cairn methodology): a version does
not ship until every tracked scope item is `DONE` (or a documented `GAP`), and
the gate that enforces this runs in CI on every push and again on the release
tag.

## Branch model

- **All** Plan A–L work for a version lands on a single integration branch:
  `release/v0.1.0`. One squash-merged PR per scope item (the per-item PR carries
  the five required artifacts — spec, RED-on-main, GREEN-on-branch, live-deploy
  screenshot, axe-core zero-violations report).
- `main` is the published line. It stays a **strict ancestor** of each release
  branch: the release branch is only ever merged into `main` when it
  fast-forwards (no merge commit, no divergence).
- **Old release branches are kept forever.** Nothing in the pipeline deletes a
  `release/*` branch. After `release/v0.1.0` ships, it stays; the next cycle
  branches `release/v0.2.0` off `main`.

```
  per-item PR  ──squash──▶  release/v0.1.0  ──fast-forward──▶  main  ──tag v0.1.0──▶  publish
                                  │                                                      │
                                  └────────────── kept (never deleted) ◀────────────────┘
                          next cycle: branch release/v0.2.0 off main
```

## The gates

Every push to `release/**` and `main`, and every PR, runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | What it runs |
|---|---|
| `typecheck` | `pnpm typecheck` (`tsc --noEmit`, 0 errors) |
| `lint` | `pnpm lint` (`biome check`, 0 errors / 0 warnings) |
| `unit` | `vitest run --exclude '**/integration/**'` |
| `build` | `pnpm build` (the bundler must compile) |
| `e2e-a11y` | Playwright + `@axe-core/playwright` — the K4 **19-route, 0-violation** WCAG 2 A/AA harness, against a `pgvector/pgvector:pg18` service DB with migrations applied |
| `verify-carry-forward-closed` | `node scripts/verify-carry-forward-closed.mjs` — **fails if any `scope.md` item is still Open** (not `DONE`, and not a `GAP` with a documented note) |

The carry-forward gate is the release-readiness check. You can run it locally at
any time:

```bash
pnpm verify:carry-forward   # prints per-plan counts + any offenders; exits non-zero if Open
```

It parses `scope.md` (the 104-item source of truth) and reports
`done / gap / open` per plan. While items are still in flight it will (correctly)
report them as offenders and exit non-zero — that is the point; it is never
fake-passed.

## Cutting a release

1. **Finish the work.** Land every item's PR (squash) onto `release/v0.1.0`.
   Flip its `scope.md` row to `DONE` only after it is browser-verified on the
   live deploy with both gates (Cov + FM) and all five artifacts attached.
2. **Confirm carry-forward is closed.** `pnpm verify:carry-forward` must exit 0
   (every item `DONE` or documented `GAP`). The same job must be green in CI on
   `release/v0.1.0`.
3. **Confirm CI is green** on `release/v0.1.0` — all six jobs above, including
   the e2e/a11y 19-route axe harness.
4. **Merge to `main`.** Fast-forward `release/v0.1.0` into `main` so `main` stays
   a strict ancestor:

   ```bash
   git checkout main
   git merge --ff-only release/v0.1.0
   git push origin main
   ```

   If it does not fast-forward, rebase the release branch onto `main` and re-run
   the gate — do not create a merge commit on `main`.
5. **Tag on `main`.** The tag is what publishes:

   ```bash
   git checkout main
   git tag v0.1.0
   git push origin v0.1.0
   ```

6. **`release.yml` publishes.** Pushing the `v*` tag triggers
   [`.github/workflows/release.yml`](.github/workflows/release.yml), which:
   - **re-runs the entire CI gate** (`uses: ./.github/workflows/ci.yml`) — incl.
     the e2e/a11y harness and `verify-carry-forward-closed` — so the publish can
     never outrun the gate; then
   - on a **GitHub-hosted runner**, builds the single all-in-one image
     **multi-arch (`linux/amd64,linux/arm64`)** via `docker/setup-qemu-action` +
     `docker/setup-buildx-action` + `docker/build-push-action`, and
   - pushes it to GHCR (`docker/login-action` with the workflow `GITHUB_TOKEN`,
     `permissions: { contents: read, packages: write }`) as
     `ghcr.io/jonathanmcohen/parchment:v0.1.0` **and** `:latest`, with
     provenance + SBOM attestations.

   Multi-arch is built on the GH-hosted runner (QEMU emulation + buildx), **not**
   locally — the user's stated preference.
7. **Keep the release branch.** Do **not** delete `release/v0.1.0`. The pipeline
   never deletes it, and neither do you.

## Next cycle

Branch the next release off the now-updated `main`:

```bash
git checkout main && git pull
git checkout -b release/v0.2.0
git push -u origin release/v0.2.0
```

`release/v0.1.0` remains in the repo, kept as the historical integration branch
for that version.

## Upgrading a deployment

The published image runs database migrations automatically on boot (s6
`migrate` service runs before `next`), so upgrading is `docker pull` + restart of
the single container. See [README.md](README.md) for image, volumes, ports, and
the full env reference.
