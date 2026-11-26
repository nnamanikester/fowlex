# Design system

The Fowlex dashboard is built on the **Pickriders dashboard design system** (tokens, shapes, motion,
components), re-coloured with the Fowlex brand (`brand/README.md`): Fowlex charcoal, comb red and
cream, with Inter, Jost and Geist Mono. Two kinds of people use it: the partners and managers at a
desk reading money, and farm staff on a phone in a poultry house logging deaths and feed.

See it live at **`/design`** (every token and, from step 1.3, every component, in the current theme).
Tokens live in `src/app/globals.css`, their Tailwind names in `tailwind.config.ts`, components in
`src/components/ui` (primitives) and `src/components/kit` (our patterns). There is no shadcn/ui and no
Radix: the components are our own.

## Principles

1. **Charcoal acts, red signs.** Primary actions are charcoal (`brand-solid`; cream in dark mode).
   Links, focus rings and icons are a slate blue from the charcoal's hue (`brand`). Comb red (`comb`)
   is identity only: the logo, the selected page's edge in the sidebar, the auth panel's glow.
2. **Red means bad news, so it stays rare.** In a finance dashboard red is loss, overdue, deaths and
   delete (`danger`). Because comb red never marks an action, a red number always means something.
3. **Colour means something, and always comes with a word.** Green, amber, red and blue are for
   status, as soft pills and slim banners: "Loss", "Overdue", "Low stock", not just a colour.
   Profit is `success`, loss is `danger`, due soon and low stock are `warning`, scheduled things
   (a vaccination due) are `info`.
4. **Amber also means Paystack test mode.** Test payments are never mistaken for real money: a
   persistent amber banner and amber "Test" pills while test keys are set.
5. **Roomy controls, calm surfaces.** 44px buttons and inputs (`min-h-11`), 16px text in inputs on
   phones (no iOS zoom), cards with a hairline and `shadow-card` on the warm `canvas`.
6. **Numbers line up.** Money and counts use tabular figures (`num`, Inter's `tnum`), right-aligned
   in tables. Naira are shown with ₦ and two decimals; they are stored as kobo integers.
7. **Mono for what you copy.** Invoice numbers (`INV-2026-0001`), batch codes (`B-2026-07`) and
   Paystack references use Geist Mono, with a copy button where it helps.
8. **The phone is a first-class screen.** Staff log from a phone with one hand: big targets, one
   column, the main action within thumb reach.
9. **Light and dark are equals.** Every token has both values; the theme follows the system by
   default. Text meets WCAG AA (4.5:1), checked by `src/lib/design/contrast.test.ts`.

## Colour tokens

Written as RGB channels, so opacity modifiers work: `bg-brand/10`.

| Token                    | Light            | Dark    | Use                                                                 |
| ------------------------ | ---------------- | ------- | ------------------------------------------------------------------- |
| `canvas`                 | #f8f4ed          | #0a1317 | The page behind everything (warm, from the brand cream)             |
| `surface`                | #ffffff          | #101b20 | Cards, inputs, the auth form column                                 |
| `surface-raised`         | #ffffff          | #16242a | Modals, menus, toasts                                               |
| `surface-subtle`         | #f3eee5          | #132127 | Hover, table header, read-only inputs                               |
| `surface-muted`          | #ebe4d8          | #1b2b32 | Selected, skeletons, empty meter bars                               |
| `line`                   | #e8e1d5          | #1b2b32 | Card edges, dividers                                                |
| `line-strong`            | #d3cabb          | #2a3f47 | Input borders                                                       |
| `fg-heading`             | #0e212a          | #f7f2ea | Headings: Fowlex charcoal                                           |
| `fg`                     | #16232a          | #e9e4db | Body text                                                           |
| `fg-muted`               | #5b6569          | #9ba6aa | Secondary text, labels                                              |
| `fg-subtle`              | #646d70          | #87938f | Meta, placeholders                                                  |
| `brand`                  | #3a7a92          | #6fb1c9 | Accents: focus ring, icons, selected controls                       |
| `brand-solid`            | #0e212a          | #f7f2ea | Primary button fill (white text light, charcoal text dark)          |
| `brand-fg`               | #245a6e          | #8cc5d9 | Links and brand text                                                |
| `brand-subtle`           | #e5eef1          | #11303b | Icon tiles, tints                                                   |
| `comb`                   | #ba2234          | #e0475a | Identity: logo, the selected page's edge (shapes, not text)         |
| `comb-fg`, `comb-subtle` | #a61e2f, #fae8e9 | —       | Brand-red text and tint, sparingly                                  |
| `charcoal`, `-mid`       | #0e212a, #16303c | same    | The auth gradient (`from-charcoal via-charcoal-mid to-comb`)        |
| `nav`                    | #0e212a          | #08151a | The sidebar; text on it is `nav-fg`, `-muted`, `-subtle`, `-accent` |

Status tones (`success`, `warning`, `danger`, `info`) each have the solid, `-fg` (text), `-subtle`
(tint) and `-line` (border). A pill is `bg-success-subtle text-success-fg`, which is what
`<Badge tone="success">` does.

Charts (step 1.5) get their own categorical palette, chosen so no series reads as profit or loss by
accident.

## Type

Inter for the interface (tabular figures for money), Jost for headings (the free cousin of Futura,
the wordmark's face), Geist Mono for codes. Tailwind's default scale, with weight doing the work:

| Use                        | Classes                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| Brand panel headline       | `font-display text-[2.5rem] font-bold tracking-tight`                  |
| Auth and empty-state title | `font-display text-[1.75rem] font-bold tracking-tight text-fg-heading` |
| Page title (PageHeader)    | `font-display text-2xl font-bold tracking-tight text-fg-heading`       |
| Section and dialog title   | `text-lg font-bold text-fg-heading`                                    |
| Headline numbers           | `num text-2xl font-semibold` (StatCard, MetricCard)                    |
| Reading text               | `text-[15px] leading-6 text-fg-muted`                                  |
| Controls, labels, tables   | `text-sm` (labels `font-semibold`)                                     |
| Meta                       | `text-xs text-fg-subtle`                                               |

## Shape, space and motion

- **Radius:** buttons `rounded-xl` (12px), inputs `rounded-lg`, cards and panels `rounded-xl`,
  modals `rounded-2xl` (a bottom sheet with `rounded-t-2xl` on phones), pills `rounded-full`.
- **Heights:** buttons and inputs 44px (`min-h-11`), small buttons 36px.
- **Shadows:** `shadow-card` (cards, panels), `shadow-button` (buttons, inputs), `shadow-pop`
  (modals, toasts).
- **Focus:** inputs get a brand border and a 4px `brand/15` glow; everything else the `focus-ring`
  (2px brand ring with a gap).
- **Motion:** buttons press to 97% on tap and show a spinner over the label while loading (the
  button never changes size); content slides up 6px on arrival. Everything decorative respects
  `prefers-reduced-motion`.

## Logo and app icon

Source files and rules are in `brand/`. The app uses:

- **Logo:** `public/brand/fowlex-logo-horizontal-color.svg` on light, `-reverse.svg` (cream, no
  background) on dark. Swap with `dark:hidden` / `hidden dark:block`. The F icon has the same pair
  (`fowlex-icon-color.svg`, `fowlex-icon-reverse.svg`).
- **Icon:** the F monogram. `src/app/icon.png` (512px) and `src/app/apple-icon.png` (180px,
  full-bleed: iOS rounds the corners), from `brand/logo/png/fowlex-app-icon-red-*`. Next.js links
  both. Rebuild them with `brand/build-logo.py` rather than editing the PNGs.

## Components

Copied from Pickriders in step 1.3 and listed here as they land.

**Now:** `ThemeToggle` (kit: light, system, dark), `Toaster` (ui: Sonner, restyled).

**Coming in 1.3:** primitives (`Button`, `LinkButton`, `Input`, `Textarea`, `Badge`, `Card`,
`Skeleton`, `ToggleSwitch`, `Modal`, `Menu`, `Avatar`, `Segmented`, `Popover`, `Sheet`) and kit
(`PageHeader`, `Panel`, `StatCard`, `MetricCard`, `Sparkline`, `EmptyState`, `FilterMenu`,
`ConfirmDialog`). **In 1.4:** the shell (charcoal sidebar with a comb-red edge on the selected page,
batch switcher, ⌘K palette, bottom tab bar on phones). **In 1.5:** `DataTable`, `MoneyInput`,
`DateRangePicker`, `FileDrop` and the chart wrappers.

Build pages from these first; add to the kit when a pattern repeats, and show it on `/design`.

## Forms

Errors show under their field, after a submit attempt or once the person has typed and moved on;
never for a field they only passed through. The first invalid field takes focus on submit. Server
errors tied to a field go under it; the rest go in an alert above the form.

## Writing

Plain words a farm hand and an accountant both read the same way. Name things by what they do
("Record deaths", "Approve expense", not "Submit" or "Confirm"). Say what happens ("This pays 5
people ₦412,000 from your Paystack balance"). Sentence case everywhere. Birds, not "units".
