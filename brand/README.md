# Fowlex brand

## Logo
- **Main logo**: rooster line mark + FOWLEX wordmark (Futura Bold, outlined).
  - `logo/svg/fowlex-logo-horizontal-*.svg`: website header, invoices, letterhead
  - `logo/svg/fowlex-logo-stacked-*.svg`: signboards, packaging, square spaces
  - `logo/svg/fowlex-mark-*.svg`: rooster on its own
- **Icon**: F monogram with a rooster comb and head.
  - `logo/svg/fowlex-icon-*.svg`: small spaces, stamps
  - `logo/svg/fowlex-app-icon-{red,light,dark}.svg`: app icon / social avatar (red is the primary)

Colour versions: `color` (on light), `reverse` (on charcoal), `mono-dark` (one colour), `mono-white` (white on dark).

PNG exports are in `logo/png/` (2000px wide logos; app icon at 32 / 180 / 512 / 1024px).
Use `fowlex-app-icon-red-32.png` as the favicon and `-180` as the Apple touch icon.

## Colours
| Name     | Hex       | Use |
|----------|-----------|-----|
| Comb Red | `#BA2234` | accent, comb, primary buttons, app icon |
| Charcoal | `#0E212A` | text, rooster body, dark backgrounds |
| Cream    | `#FBF6EE` | light backgrounds, text on dark |

## Type
Futura Bold for headings and the wordmark. Pair it with a clean sans such as Inter for body text and the dashboard UI.

## Source
Generated with Recraft (`concepts/1-rooster-line-a.svg`, `concepts/3-f-monogram-a.svg`).
Rebuild with `python build-logo.py concepts logo 2` (needs `fonttools` and `svgpathtools`).
