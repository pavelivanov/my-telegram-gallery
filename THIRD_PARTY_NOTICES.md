# Third-party notices and asset inventory

This inventory supports release review; it is not a license for the project and
does not replace the license texts shipped by dependencies.

## Telegram Mini Apps template

The administrator and gallery frontends were derived from the Telegram Mini
Apps React template. Their upstream MIT license and copyright notice remain at:

- [`apps/admin/LICENSE`](apps/admin/LICENSE)
- [`apps/gallery/LICENSE`](apps/gallery/LICENSE)

The template documentation images under `apps/admin/assets`,
`apps/admin/.github`, `apps/gallery/assets`, and `apps/gallery/.github` remain
in the repository. Their exact provenance and publication need owner review
before a public release; they are not copied into the production image.

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
