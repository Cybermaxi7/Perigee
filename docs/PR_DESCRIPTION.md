# docs(web): generate a versioned component-library docs site from source (#709)

Closes #709 · Source: `web.md` § Developer Experience & Tooling (#34)

---

## TL;DR

The component library now documents itself. `npm run docs:build` reads the
component sources with the TypeScript compiler API and emits **committed
markdown** (props tables, usage examples, composition patterns, accessibility
notes) plus a **static docs site** served from `web/public/component-docs`. A
curated `breaking-changes.json` turns real API differences into a generated
migration guide with before/after props tables, and `npm run docs:release`
freezes a browsable snapshot per release, versioned with `web/package.json`.

Nothing in the docs is written twice: 7 pages / 13 exports are derived from
TypeScript + JSDoc, and `npm run docs:check` fails CI the moment the committed
docs drift from the source.

```bash
cd web
npm run docs:build     # regenerate markdown + docs site (committed)
npm run docs:check     # CI guard: fails if anything is stale
npm run docs:release   # freeze + publish this version's snapshot
npm run docs:serve     # local preview at http://localhost:4173
```

---

## Why

`web.md § Developer Experience & Tooling` calls for a component library with
documented props, examples, accessibility guidance and migration paths. Today
there is no component documentation at all: the primitives in
`web/components/ui/` have inconsistent JSDoc, `Badge` is the only one with an
`@example`, the legacy `CommonButton` is indistinguishable from the newer
`Button` without reading both files, and there is no record of the API changes
already shipped (WEB-27 / #113 standardisation, WEB-38 / #492 contrast pass).

Hand-written docs would rot on the next refactor. So the deliverable is a
**generator plus its output**, with a drift check that makes staleness a CI
failure rather than a code-review hope.

---

## What's in the PR

### 1. Generator (`web/scripts/docs/`)

| File | Lines | Responsibility |
| --- | --- | --- |
| `lib/extract.mjs` | 566 | TypeScript/JSDoc → documentation model |
| `lib/render.mjs` | 410 | model → markdown (props tables, examples, composition, a11y, migrations) |
| `lib/markdown.mjs` | 241 | markdown → accessible HTML (dependency-free) |
| `lib/site.mjs` | 421 | markdown → static docs site (nav, TOC, search, version selector, CSS/JS) |
| `lib/text.mjs` | 64 | slug/id/escaping helpers |
| `registry.mjs` | 209 | hand-written: what to document, groups, cross-component patterns, a11y baseline |
| `generate.mjs` | 646 | CLI: build / check / release, versioning, link validation |
| `serve.mjs` | 71 | zero-dependency local preview server |
| `breaking-changes.json` | — | hand-written: versioned breaking changes + codemods |

**Extraction (`extract.mjs`)** uses `ts.createSourceFile` (no full `Program`, so
a docs build never type-checks the app) and handles every component shape in the
library:

- `export function Foo(props: FooProps)` — `Spinner`, `Badge`, `DataTable`,
  `LiveStatus`, `LiveAlert`
- `export const Foo = React.forwardRef<Ref, FooProps>(…)` — `Button`, the whole
  `Card` family
- `export const Foo: React.FC<FooProps> = …` — `CommonButton`

From each component it derives:

- **props** — name, optionality, type text, and the JSDoc on the *props
  interface member* as the description
- **defaults** — from destructuring (`size = "md"`), including aliased
  destructuring (`asChild: _asChild = false` reports `asChild`), overridable
  with `@default`
- **generic props types** — `DataTableProps<T>` / `ColumnDef<T>` resolve to
  their declarations instead of rendering as opaque strings
- **inherited attributes** — `extends React.ButtonHTMLAttributes<…>` plus the
  inferred host element (`button`, `span`, `div`, `h3`, …)
- **referenced types** — `SpinnerSize`, `SpinnerColor`, `BadgeVariant`
  (unexported ones too), with union members listed as allowed values and object
  types rendered as their own props table (`ColumnDef`)
- **JSDoc tags** — `@example`, `@accessibility`, `@since`, `@deprecated`,
  `@note`, `@default`, `@composition`, plus `{@link X}` → `` `X` ``
- **documentation precedence** — component JSDoc → its props-interface JSDoc
  (`LiveRegion.tsx`) → file-level JSDoc (`ui/DataTable.tsx`)

**Markdown + docs site** — the markdown is the single source the site is built
from, so the two can never disagree. The site adds:

- accessible shell: `lang`, skip link, `aria-label`led nav, labelled search box
  with `role="status"` live results, `<th scope="col">` tables, one `<h1>` per
  page, unique ids, visible focus, `prefers-reduced-motion` support
- per-page "On this page" TOC, component search over a published
  `search-index.json`, copy-to-clipboard on code blocks (progressive
  enhancement — everything works without JS)
- a **version selector** that links the current version to the live docs and
  older versions to their frozen snapshots

### 2. JSDoc on the library itself (+185 lines, comments only)

`Button`, `Card` (all six parts), `Badge`, `Spinner`, `DataTable`,
`LiveRegion` and the legacy `CommonButton` gained the prose that makes the docs
worth reading: import-time intent, `@example`s, `@accessibility` notes
(keyboard, focus, icon-only labelling, live-region politeness, contrast,
reduced motion) and composition guidance for the compound `Card`.

`CommonButton` is marked `@deprecated` with a pointer to `Button`. **No runtime
behaviour changed** — the diff is JSDoc plus two markdown links.

### 3. Generated artifacts (committed, reviewable)

`web/docs/components/` (13 files) — `README.md` index, one page per component,
`migrations.md`, `versions.md`, `manifest.json` (machine-readable docs model),
`versions.json`, `versions/0.1.0.json` (frozen snapshot).

`web/public/component-docs/` (26 files) — the static site: `index.html`,
9 pages, `assets/docs.css`, `assets/docs.js`, `search-index.json`,
`versions.json` and the `versions/v0.1.0/` snapshot. Served by the app at
`/component-docs/index.html` and deployable as-is to any static host.

### 4. Tests — `web/__tests__/component-docs.test.cjs` (62 subtests, 610 lines)

| Suite | What it pins down |
| --- | --- |
| props tables | types from unions, defaults from destructuring (incl. alias regression), `@default`, required flags, generic resolution, referenced types, inherited attributes |
| page content | description/usage/composition/a11y per page, deprecated banner + migration target, index coverage |
| migration guide | releases list, before/after tables generated from the *real* components (`CommonButton` vs `Button` variant sets), call-site mappings, codemods |
| docs site | every page published, `lang`/skip link/aria-labelled nav/live search status, exactly one `<h1>`, unique ids, scoped table headers, no `.md` links left, no dangling internal links, search index |
| versioning | current version tracks `package.json`, released snapshots exist on disk, snapshot links resolve, release + selector run in an isolated root |
| drift | fails with nothing generated, passes after a build, fails on a hand-edited page ("stale"), fails on an orphaned page ("unexpected"), prunes orphans, never deletes published snapshots |
| units | extractor (props/defaults/tags, missing export), markdown renderer (escaping, scoping, nested lists, fences, link resolution), indented-code conversion |

### 5. CI — `.github/workflows/component-docs.yml`

- `docs` job (PRs / pushes): `npm ci` → `npm run docs:check` → `npm test` →
  upload the built site as an artifact. This is what makes "docs are current" a
  merge requirement.
- `publish` job (GitHub release or manual dispatch): resolves the released tag,
  runs `npm run docs:release -- --version … --date …`, commits the frozen
  snapshot back to the default branch, and deploys the site to GitHub Pages.

Also added `web/.eslintignore` so the generated site/markdown is never linted
(and generated HTML/JS noise can't hide real lint problems).

---

## Design decisions worth reviewing

1. **A generator, not Storybook.** The issue asks for docs *auto-generated from
   TypeScript/JSDoc* on a *dedicated docs site*. A Storybook install would add
   ~15 packages, a second build pipeline and a dev server to a repo whose
   dependency set is deliberately small; the generator is ~2.6k lines of plain
   ESM with **no new dependencies at all** (TypeScript was already a
   devDependency) and produces artifacts that are reviewable in the PR diff.
2. **Markdown is the artifact; HTML is derived.** GitHub renders the committed
   markdown, the CI artifact publishes the HTML, and both come from one model —
   so a reviewer reads the docs in the diff instead of hunting generated HTML.
3. **Drift check instead of a `prebuild` hook.** Wiring `docs:build` into
   `next build` would make every app build fail on a docs typo, and it would
   still not tell reviewers that generated files were forgotten. `docs:check`
   runs in CI, on the committed artifacts, and reports missing/stale/unexpected
   files.
4. **Fail loudly on broken links.** The generator validates every href, anchor,
   and markdown link before writing. It already caught two real bugs during
   development: snapshot pages needed `../../` (not `../`) to reach the site
   root, and a hand-seeded `versions.json` claiming a snapshot that did not
   exist.
5. **Frozen snapshots are immutable.** `--release` writes
   `versions/v<version>/…`; ordinary builds and `docs:check` treat anything
   under `versions/` as permanent, so an old release can never be silently
   rewritten or pruned by a later build.
6. **Versioning source of truth.** `web/package.json#version` drives the docs
   version; `docs/components/versions.json` records what has been published
   (with `released` date + `docsPath`). An unreleased version shows in the
   selector as `(snapshot not published)` and is not selectable.

---

## Verification

All commands run inside `web/`.

| Check | Command | Result |
| --- | --- | --- |
| **CI (GitHub Actions)** | `Component Library Docs` run 38768125648 | **✓ success** — `docs:check`, full test suite, `component-docs-site` artifact |
| Tests | `npm test` | **155 pass, 0 fail** (62 new) |
| Docs in sync | `npm run docs:build -- --check` / `npm run docs:check` | **exit 0** |
| Docs build | `npm run docs:build` | 7 pages / 13 exports from source |
| Release flow | `npm run docs:release` | `versions/0.1.0.json` + `versions/v0.1.0/` snapshot published |
| Link validation | part of every build | 0 broken links, 0 broken anchors, 0 duplicate ids |
| Serve | `npm run docs:serve` | `/`, `/button.html`, `/assets/docs.css` → 200; unknown → 404 |
| Typecheck | `npx tsc --noEmit` | **no new errors** (pre-existing errors only, see below) |
| Lint | `npm run lint` | **no new errors** (pre-existing errors only, see below) |
| Production build | `npm run build` | **fails on pristine `main` too** — see below |

### Pre-existing failures (not introduced by this PR, not fixed here)

These were reproduced on a pristine `HEAD` checkout (`git worktree` of
`main` 4834574, same `node_modules`) before any of this PR's changes were
applied. Fixing them belongs to the App Router migration (#…/`MIGRATION.md`),
the eslint config and the test script, not to the docs issue — but they are why
`npm run build` / `npm run lint` / `npx tsc --noEmit` are still red on `main`, and
why they are not part of this PR's acceptance:

1. **`npm run build` fails with 3 Turbopack errors** (identical on pristine
   `main`):
   - `App Router and Pages Router both match path: /`
   - `App Router and Pages Router both match path: /vault/[id]`
   - `Can't resolve '../vault/[id]/page'` from `app/vaults/[id]/page.tsx`
   These are the known coexistence hazards described in `web/MIGRATION.md`.
   This PR adds no routes: the docs site is static files under
   `public/component-docs/`.
2. **`npx tsc --noEmit` reports 33 errors in 11 files** unrelated to the docs
   (`lib/i18n.ts`, `lib/vault-metadata.ts`, `pages/index.tsx`, `pages/_app.tsx`,
   `app/[vaults]/…`, `playwright.config.ts`). None of the files this PR edits
   appear in the output.
3. **`npm test` aborts on Node ≤ 20.** The web `test` script passes `**`
   patterns directly to `node --test`, and only Node ≥ 22 expands those itself:
   on Node 20 the run dies with
   `Could not find '…/web/lib/**/*.test.cjs'` before executing anything (and
   only `__tests__/migration/appRouter.test.cjs` ever matched). The docs CI job
   therefore pins `node-version: '24'`, the version the app is developed
   against. Changing the shared script is a separate, cross-cutting fix.
4. **`npm run lint` reports 296 problems (281 errors, 15 warnings)** — 273 of
   them are `Definition for rule '@typescript-eslint/…' was not found` on
   *every* file, because `.eslintrc.json` enables TypeScript rules without
   `@typescript-eslint/eslint-plugin` installed. The remaining 8 are real
   `react/no-danger` and `react-hooks/exhaustive-deps` findings in untouched
   files. Adding the plugin/lockfile change is out of scope and would surface a
   much larger cleanup; `.eslintignore` in this PR only excludes generated
   artifacts, which returns the count to its previous level.

---

## PR hygiene

- Branch: `docs/component-library-docs-709` → `main`
- 60 files, +9,267 / −9 (≈1,000 lines of generated markdown, \~2,600 lines of
generator + tests, 185 lines of JSDoc-only changes to components, 26 generated
site files)
- Two commits: the feature, then the CI Node pin (see pre-existing issue 3)
- No new dependencies; `package-lock.json` untouched

## Usage after merge

```bash
cd web

# Author docs: add the component to scripts/docs/registry.mjs, write JSDoc…
#   prop description      → JSDoc above the prop in the props interface
#   default               → inline destructuring default, or @default
#   usage example         → @example
#   accessibility notes    → @accessibility
#   composition guidance  → @composition
#   deprecation          → @deprecated (raises the banner + links the replacement)
#   breaking change      → scripts/docs/breaking-changes.json

npm run docs:build     # regenerate + commit
npm run docs:check     # what CI runs
npm run docs:release   # when cutting a release
npm run docs:serve     # read it locally
```

Docs site URLs: `http://localhost:3000/component-docs/index.html` from the app’s
`public/`, or the GitHub Pages deployment published by the `publish` job (enable
Pages → “GitHub Actions” as the source once).

---

## Risk / rollout

- **Runtime risk: none.** No application component behaviour changed; the
  component edits are comments (verified by diff review and the existing test
  suite, which still passes).
- **Bundle risk: none.** The docs site is static HTML served from `public/`; no
  new dependency, no new route, nothing added to the Next build graph.
- **Revert:** delete the new files and the JSDoc blocks; the generator touches
  nothing else.
- **Follow-ups worth filing separately:** the 3 pre-existing issues above,
  plus per-component `@example` coverage for the remaining app components
  (`VaultRow`, `NetworkStatusBanner`, …) which are intentionally out of the
  library registry for now.
