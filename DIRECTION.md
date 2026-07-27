# Direction — ninochavez.co/photography

Art direction for this surface. Like the urvil record and unlike the others, this one is
**derived, not authored**: [`DESIGN.md`](./DESIGN.md) already states the direction in its
own words. This file exists so an automated defect scanner can tell the difference between
that document being executed and generic generated-UI slop, because on the surface they
look identical.

A finding with no `authorized` row here is a defect. Absence of a record is not permission.
Direction constrains *how* a correctness failure is fixed — never *whether*.

## Thesis

Quoting `DESIGN.md` rather than paraphrasing it:

> The design system has one uncompromising constraint: **the chrome must never compete
> with the photographs**. Dark background, minimal UI, small type, gold used sparingly as
> the single accent. The photography is the product; everything else recedes.

That document also draws a **surface-class line** this record depends on: the display type
scale is *"explicitly forbidden on gallery surfaces"* and *"exists for About, Contact,
Landing, and Marketing pages only."* So the site already holds its gallery surfaces to a
stricter standard than its landing page, and this record inherits that boundary rather
than inventing one.

## Ledger

| id | verdict | device | cites the thesis by | rules |
|---|---|---|---|---|
| `contained-cover-scale` | authorized | On a gallery card, the cover photograph scales to `1.05` inside a static `overflow-hidden` frame — `scale-105`, `duration-200`, `ease-out`. The card itself does not move. `CollectionCard.svelte:67`, `AlbumCard.svelte:171`, `ai/PhotoGrid.svelte:46` | The frame, the border and the label hold still; the only thing that moves is the photograph, and it moves *toward* the reader. That is the thesis stated as a gesture — chrome recedes, the picture advances. A grid of photographs is itself a composition, and this device leaves that composition undisturbed: no neighbour shifts, no tile overlaps another | `image-hover-transform` |
| `lifting-tile` | removed | The whole grid tile scaled and rose toward the cursor — `hover:scale-105 hover:-translate-y-1` on the `<a>` itself, so border, background and caption travelled with the image. Was on `AlbumCard.svelte:141` and `ai/PhotoGrid.svelte:36` | **Could not cite it.** A tile that lifts out of a grid breaks the grid — it overlaps its neighbours and makes the chrome the most active thing on a page whose stated rule is that chrome recedes. The affordance it provided is real, so it was **converted rather than deleted**: both now use `contained-cover-scale`, which `CollectionCard` already shipped. The in-repo reference implementation won | `image-hover-transform` |
| `landing-portfolio-lift` | undecided | The homepage portfolio strip lifts and deepens its shadow on hover — `hover:-translate-y-1`, `hover:shadow-[0_22px_44px_-18px_...]`, with the image scaling `1.04` over `500ms` inside it (`routes/+page.svelte:198-205`) | Genuinely unsettled, and deliberately left alone. `DESIGN.md` grants Landing surfaces latitude it denies gallery surfaces, so the argument that condemned `lifting-tile` does not automatically reach here. But the same document says **"No shadows"** — *"shadows disappear visually and only add rendering cost"* — and this device is built on one. Two of the document's own rules point opposite ways on the same element; that is a decision for the operator, not a scanner | `image-hover-transform` |

## Constraints on fixes

**One gesture, one value.** Before this record there were four implementations of a single
hover treatment: `scale-105`/200ms, `scale-105`/`transition-all`, `scale-105`/300ms, and
`scale-[1.04]`/500ms. `contained-cover-scale` is now the only authorized form on gallery
surfaces and it is `scale-105 duration-200 ease-out`. A new value is drift, not taste.

**Do not put two `transition-*` utilities on one element.** Both emit
`transition-property`, so one silently wins. `AlbumCard` carried `transition-transform`
*and* `transition-colors`; the computed value on the live page was
`transform, translate, scale, rotate`, and the `hover:border-gold-500/50` treatment never
animated. Fixed in `a20be23`. Where two properties must animate together, name them once —
`transition-[transform,border-color]`.

**Reduced motion is already handled globally.** `app.css` forces
`transition-duration: 0.01ms !important` under `prefers-reduced-motion: reduce`, so the
authorized device snaps rather than animating. That is the correct treatment and no device
here needs its own guard.

## Notes

All 20 `image-hover-transform` findings on this surface are **`severity: advisory`** — they
are reported and never counted toward the exit code. Adjudicating them was worth doing on
the merits, not to turn a build green. Nothing here was gating anything.

The scanner cannot locate these findings: it reports `file` as the page URL, `line` as `0`,
and `snippet` as the literal string `Tailwind hover transform on <img>` for all twenty.
Every element above was found by reading the source, not by following the finding. A rule
that says *what* without *where* can be adjudicated but not audited.

The 5 `low-contrast` findings on this surface are real and unadjudicated — hero copy over
a photograph at 2.0:1 and 3.4:1. The fix is a scrim, which is an art-direction choice, so
it belongs in this record before it belongs in the CSS.
