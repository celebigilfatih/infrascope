# Bundled Inter

- Upstream: https://github.com/rsms/inter/tree/v4.1
- Version: Inter 4.1, variable upright, weight range 100–900.
- Pinned commit: `e3a3d4c57d5ecc01453a575621882a384c1995a3`.
- Original file: https://raw.githubusercontent.com/rsms/inter/e3a3d4c57d5ecc01453a575621882a384c1995a3/docs/font-files/InterVariable.woff2
- SHA-256: `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`.
- License: SIL Open Font License 1.1, included unmodified in [OFL.txt](OFL.txt).
- License SHA-256: `262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a`.

The upstream binary is unmodified and includes Turkish glyphs. The root layout
uses `next/font/local`; compilation reads this file and emits a same-origin
`/_next/static/media/` asset. No build-time font download is required. The public
directory also ships the original font and its license in production images.

Keep the binary and license in source control. Updating the font is an explicit
asset update: verify provenance, update the checksum in the font regression and
rerun the network-isolated product build. Do not add an install/download step.

`InterVariable.ttf` is the uncompressed representation of the same bundled WOFF2
font for the 3D text renderer, which cannot consume the layout's WOFF2 directly.
It retains the same family, axes, Turkish glyphs and accompanying OFL license.
SHA-256: `c5de106eb3ffd7790cde68809043884c14380ce0bdb6560e812b75e1981fc61c`.
It was generated with FontTools using `TTFont(source, recalcTimestamp=False)`,
`font.flavor = None`, and `font.save(destination)`. The existing root layout still
uses the original WOFF2. Both formats ship as source assets; no font converter or
font download runs at installation, image startup or customer request time.
