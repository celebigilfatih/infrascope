# Local fonts and offline release build

## Asset contract

The root layout loads Inter with `next/font/local` from
`public/fonts/inter/InterVariable.woff2`. Normal style, variable weights 100–900,
`font-display: swap` and the existing `inter.className` application are retained.
The unmodified Inter 4.1 binary includes Latin and Turkish glyphs. The original
SIL OFL 1.1 license is included in `public/fonts/inter/OFL.txt`; the public folder
is already copied into the runtime image. Next emits a content-addressed font
under `/_next/static/media/`, generates fallback metrics and preloads the root
font. No font provider request or package installation occurs during compilation.

Upstream commit, download URL and asset/license checksums are recorded in
[`public/fonts/inter/README.md`](../../public/fonts/inter/README.md). The font was
downloaded once during this implementation and is stored alongside the source;
include the binary and license with every checkout. Build machines do not download it.

## Regression checks

```sh
npm run test:local-fonts
# After a real product build:
npm run test:local-fonts -- --build-dir .next
```

The source check verifies the pinned WOFF2 and full license checksums, actual
font family/weight axes, Latin/Turkish character coverage and absence of Google
font imports/URLs in product source. It uses Next's existing bundled font parser;
no new package is installed. Reusable release-quality CI runs this check.

The output check additionally requires a build ID, the root font in Next's
preload manifest, matching emitted binary bytes, local generated CSS with the
variable weight range, and a reference from the prerendered login page.

## Actual verification — 2026-10-16

Base commit: `816e6036fea121be4402fcdc81a68aaadda7331e`, with the existing dirty
working tree preserved. This verification applies to the copied working snapshot;
no commit, deployment or application restart was performed.

An owned container used immutable image
`sha256:daf880f6655d0fdb5bd863f8a0407dcb93f57c2f530f3fa89dd573c36f60d3b0`,
**Docker `--network none`**, read-only source/dependency mounts and read-only root
filesystem. A fresh `/work/offline-release` tmpfs source copy had no `.next` cache,
installation dotenv files, machine/license state, backups or logs. Dependencies
were already installed; Prisma 5.22.0 was generated only in tmpfs, with no database
connection. Node 20.20.2, Next 14.2.35 and TypeScript 5.9.3 were used.

The real command was `npm run build`, with a sanitized environment containing
`NODE_ENV=production`, `CI=1`, `NEXT_TELEMETRY_DISABLED=1`,
`NEXT_DISABLE_LOCKFILE_PATCH=1` and the existing Docker build mode
`INFRASCOPE_BUILD=1`. The latter provides the existing build-only syntactic Prisma
URL; it does not disable quality checks. No source adapter, SMTP recipient or
installation database was available. No dependency installation was attempted.

| Check | Actual result |
|---|---|
| Full `npm run build` | **PASS, exit 0**: policy, TLS scan, TypeScript, full lint, production compilation, page collection, **112/112** static pages, optimization and build traces |
| Native Next type/lint validation | PASS; no skipping/bypass messages |
| Source and output font regression | PASS; emitted font checksum matches the pinned upstream binary; manifest/CSS/login reference the same local asset |
| Focused ESLint on layout and font regression | PASS, zero messages |
| Release policy/scanner/workflow regressions | PASS, 26 scenarios |

The successful artifact contained `static/media/0336a89fb4e7fc1d-s.p.woff2`; the
generated `@font-face` URL is same-origin and declares weights `100 900`, normal
style and swap display. Both original font/license assets are also present in
the product source copy for the existing Docker public-assets copy step.

The 9 existing lint warnings remain unchanged. Build output also reports the
existing Browserslist database age and `jose` Edge Runtime compression API
warnings; they did not fail compilation and were not changed in this font task.
Browser visual checks, a complete Docker image build, package-installation
offline support and deployment were not tested. The verified scope is the real
application release build using already installed dependencies. The owned checks
container was removed after verification.

See [sanitized build evidence](../audits/OFFLINE_FONT_BUILD_2026-10-16.json).
