# Design system

The Fowlex dashboard is built on the **Pickriders dashboard design system** (tokens, shapes, motion,
components), re-coloured with the Fowlex brand (`brand/README.md`): Fowlex charcoal, comb red and
cream, with Fraunces, Lexend, IBM Plex Sans and Geist Mono. Two kinds of people use it: the partners and managers at a
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
6. **Numbers line up.** Money and counts use the figures face with tabular figures (`num`), right-aligned
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

Three faces, each with one job, so titles, reading and numbers never look alike:

- **Fraunces** (`font-display`) for titles: a soft serif, set with `SOFT 100` and no quirky
  letters, warm like the land rather than stern like a newspaper.
- **Lexend** (`font-sans`, the default) for everything you read: drawn from reading-proficiency
  research to cut visual stress, for people new to screens. Its zero is plain (a slashed zero, as
  in Atkinson Hyperlegible, made every amount look technical).
- **IBM Plex Sans** (`num`) for money and counts: tabular, lining figures that line up in columns,
  with a clear 1 and 7. `num` wins over `font-display`, so a big amount stays a number.
- **Geist Mono** for codes: invoice numbers, batch codes, references.

Tailwind's default scale, with weight doing the work:

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

- **Breathing room:** nothing touches. A title and the line under it get `space-y-1`; an amount
  over its status pill is a column with `gap-1.5`; a label (`dt`) over its value (`dd`) gets 4px
  on its own (a base rule). `e2e/spacing.spec.ts` fails if any two controls overlap on any page.
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

Ported from the Pickriders dashboard (step 1.3). Import kit pieces from `@/components/kit`.

**Primitives** (`components/ui`): `Button` and `LinkButton` (primary, secondary, ghost, danger,
link; sm, md, lg, icon; `loading`, `fullWidth`), `Input` and `Textarea`, `Badge` (tones, `dot`),
`Card`, `Skeleton`, `ToggleSwitch`, `Avatar` (people round with two initials, customers square with
one), `Segmented` (two to four exclusive choices, arrow keys move), `Modal` (native `<dialog>`: focus
trap and Escape for free; a bottom sheet on phones), `Sheet` (one row up close: a right-hand panel
from md, a bottom sheet on phones), `Menu` / `MenuItem` / `MenuLabel` / `MenuSeparator` (arrow
keys, Escape, focus back to the trigger; portalled and placed against the viewport, flipping up near
the bottom), `Popover` (a short explanation under its trigger), `Toaster` (Sonner, restyled).

**Kit** (`components/kit`): `PageHeader`, `Panel`, `StatCard`, `MetricCard` (a linked headline
number with its change and a `Sparkline`; `invert` when down is good, like feed cost or deaths),
`ProgressRing` (weeks to sale), `EmptyState`, `FilterMenu` (one filter as a pill),
`ConfirmDialog` (`typeToConfirm` for the most destructive actions, such as deleting a batch),
`IdText` and `CopyButton` (invoice numbers, batch codes, Paystack references), `TestModeBanner`
(Paystack test keys), `Kbd`, `ThemeToggle`.

**Shell** (`components/shell`, step 1.4): the frame every signed-in page sits in, under
`src/app/(dashboard)`.

- **The sidebar is Fowlex charcoal** (`nav` tokens, the same in both themes) with a comb-red glow in
  the top corner. From the top: the cream logo; the **batch switcher** (the batch the farm pages
  look at: its number on a comb-to-charcoal tile, day and live birds, Growing or Selling; remembered
  per browser); **Search or jump to… ⌘K**; the pages in groups (Overview, Farm, Sales, Money, Team);
  you.
- **The highlight slides** to the page you open: a soft pill with a lit light-comb-red edge
  (`nav-accent`). Hovering a page shows its shortcut (`G` `B`).
- **It folds to a rail** of icons (the round handle on its edge, or `[`), remembered per browser.
  Folded, each icon shows its name beside it on hover or focus.
- **The header** says where you are (Fowlex Farms › page › deeper page) and holds the page's tools.
- **Phones and tablets** get a tab bar along the bottom (the first four pages the role can open,
  then More, which opens the full sidebar as a drawer) and a search button in the header.
- **The command palette** (⌘K or Ctrl K, `/`, or the search buttons): pages, the daily actions (log
  today's numbers, new batch, record an expense, new invoice), other batches and the theme.
- **Roles decide the nav** (`navFor` in `nav.ts`, from `lib/auth/permissions.ts`): owners see
  everything, managers everything but Settings, staff only Batches, Daily log and Inventory (no
  money), customers nothing (they use the portal).
- Until sign-in (1.7) and batches (2.2) exist, the layout uses `lib/workspace-preview.ts`.

**Data and money** (step 1.5):

- `formatNaira(kobo)` (`lib/money.ts`) is the only way money reaches the screen: `₦1,234.56`, or
  `{ compact: true }` for axes (`₦1.3M`). `nairaToKobo` parses what people type, and gives whole kobo
  or null, never a rounded guess.
- `MoneyInput` (ui): naira in, kobo out. Keys that would make it invalid are ignored; commas and two
  decimals fill in on blur.
- `DateRangePicker` (kit): preset rows (today, last 7 or 30 days, this or last month, this year)
  and a custom range. Dates are Lagos calendar days (`lib/dates.ts`). It reads today through
  `useToday()`, which is null while prerendering, so it's safe on any page.
- `FileDrop` (ui): receipts and contracts. Drop or tap (a phone offers the camera); type and size
  are checked; previews with remove. Uploading is the form's job.
- `DataTable` (`components/tables`): sortable headers, search over the CSV columns, a toolbar slot
  for filters, pages, an empty state, Export CSV (`lib/csv.ts`: byte-order mark for Excel, formulas
  neutralised, money as naira numbers) and row clicks. Put a link in the first cell so rows work
  from the keyboard too. `hideBelow` drops less important columns on phones.

**Charts** (`components/charts`, Recharts): `TrendChart` (one to six lines over time; a single series
gets a wash), `ForecastChart` (actual, a dashed forecast in the same colour, the 80% range as a band,
and a "Today" rule) and `BreakdownBar` (part of a whole as one stacked bar with a legend of values
and shares; past six parts the smallest fold into a gray "Other"). The plan said donut; a stacked
bar is easier to read.

- **Series colours** run blue, orange, violet, magenta, yellow, aqua (`chart-kit.tsx`): the
  reference data-viz palette re-ordered so green and red, which mean profit and loss here, are never
  a series. Validated in both modes against the card surfaces (adjacent CVD ΔE ≥ 8.4, normal-vision
  ΔE ≥ 19.3). Assign in order, never cycled, and pass categories in a fixed order so each keeps its
  colour.
- **Marks:** 2px lines, 8px hover dots with a surface ring, solid 1px gridlines, one y-axis (never
  two scales on one chart).
- **Reading without colour or hover:** a legend for two or more series, names at line ends when four
  or fewer don't collide, a crosshair tooltip listing every series (value first), and **View as
  table** under every chart. Slots 4–6 are under 3:1 on white, which is why the table is not optional.
- Charts draw after hydration (theme colours are known only in the browser) behind a same-height
  placeholder.

**Next:** `Field` and the sign-in pieces in 1.7.

Build pages from these first; add to the kit when a pattern repeats, and show it on `/design`.

## Forms

Errors show under their field, after a submit attempt or once the person has typed and moved on;
never for a field they only passed through. The first invalid field takes focus on submit. Server
errors tied to a field go under it; the rest go in an alert above the form.

## Writing

Plain words a farm hand and an accountant both read the same way. Name things by what they do
("Record deaths", "Approve expense", not "Submit" or "Confirm"). Say what happens ("This pays 5
people ₦412,000 from your Paystack balance"). Sentence case everywhere. Birds, not "units".
