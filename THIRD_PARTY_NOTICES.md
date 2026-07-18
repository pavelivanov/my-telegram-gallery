# Third-party notices and asset inventory

The original project code is licensed AGPL-3.0-only as described in the root
`LICENSE` and `NOTICE`. This inventory records separately licensed incorporated
material and does not replace the license texts shipped by dependencies.

## Telegram Mini Apps template

The administrator and gallery frontends were derived from the Telegram Mini
Apps React template. Their upstream MIT license and copyright notice remain at:

- [`apps/admin/LICENSE`](apps/admin/LICENSE)
- [`apps/gallery/LICENSE`](apps/gallery/LICENSE)

The unused template documentation images and nested GitHub Pages workflows were
removed before release. No template screenshots are copied into the production
image. The upstream MIT license files remain with both derived packages.

## Runtime dependencies

Production dependencies currently report the following license identifiers:
MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense, and
LGPL-3.0-or-later. The LGPL entry is the platform-specific libvips binary used
by Sharp. Release candidates contain a machine-readable `licenses.json` and a
CycloneDX SBOM generated from the actual runtime image.

Package licenses and notices remain in their distributed npm packages where
provided. Run `pnpm licenses list --prod --json` and review the generated
release inventory whenever dependencies change.

## Project screenshots

`albums-page.png`, `album-page.png`, and `viewer.png` are synthetic UI captures
using abstract gradients rather than customer media. Copyright ownership of the
captures must still be confirmed by the owner before they are used in public
marketing or documentation.

No external fonts, stock photography, or icon files are currently bundled by
the application source. The UI relies on system font stacks and code/CSS.
