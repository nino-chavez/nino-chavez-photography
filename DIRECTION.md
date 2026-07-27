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
| `hero-legibility-scrim` | authorized | Two stacked gradients between the hero photograph and its copy (`PremiumHero.svelte:264-265`): horizontal `charcoal-950` → `/80` at midpoint → transparent at the right, and vertical `charcoal-950` at the base → `/10` at midpoint → `/25` at the top | The hero rotates through curated frames, so legibility cannot depend on which photograph loaded — it needs a **guaranteed floor**, and this is it. Composited against a pathological pure-white frame the worst case is still `#3f3f41` under the h1, `#232326` under the small print. Measured, not asserted: **10.51:1 / 10.24:1 / 6.15:1** against requirements of 3 / 4.5 / 4.5. The scrim is heaviest exactly where the copy sits and clears to nothing over the right of the frame, so the photograph is unobscured everywhere the reader is not reading | `low-contrast` |

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

**Four of the five `low-contrast` findings on this surface are false positives, and the
measurement that shows it is the one to repeat.** Three are hero copy, reported between
1.1:1 and 3.4:1 "via canvas-img-underlay" — the rule samples the `<img>` element's own
pixels and never composites the two scrim layers sitting on top of it. The fourth is the
header wordmark at "2.1:1"; the header is `bg-charcoal-950/95`, so even over a pure-white
underlay its floor is `#242426` and the wordmark is **15.57:1**. That ratio is not
reachable.

The method that settles it, because the first attempt got it wrong: screenshot the page,
then **hide the text and screenshot again**, and sample the second image. Sampling around
the glyphs instead pulls in antialiased edge pixels — a `#e0e0e0` edge of white text reads
as a bright background and manufactures a 1.3:1 that does not exist. Confirm the empirical
number against the gradient arithmetic for a pure-white frame; if the two agree, the floor
is real and holds for every slide rather than the one that happened to load.

**`hero-legibility-scrim` is authorized but deliberately carries no suppression.** The only
suppression the config format can express here is `rule: low-contrast` scoped to this
host — and that would silence every future contrast defect on a photography site, which is
the false-negative shape this whole program exists to prevent. The four findings keep
appearing in the count and that is the correct trade: a number that is honestly four too
high beats a gate that has stopped looking. A ledger row with no suppression pointing at it
is valid; the resolver checks that suppressions cite authorized devices, not the reverse.

**One `low-contrast` finding was real** and had nothing to do with the hero: the `⌘K` chip
in the header search button, `charcoal-300` on `charcoal-700`, **4.20:1** against 4.5.
Fixed by lightening the label one step on the declared ramp to `charcoal-200` (5.51:1)
rather than darkening the chip, because the chip must stay lighter than the
`charcoal-900/50` button around it or it stops reading as a key cap. The `Search` label
beside it was checked at the same time and passes at 5.59:1.

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

An earlier draft of this file said the 5 `low-contrast` findings were "real and
unadjudicated" and that "the fix is a scrim." Both claims were wrong, and they were
repeated twice before anyone measured. The scrim already existed; four of the five
findings were artifacts of how the rule samples. Kept here rather than quietly deleted,
because the failure was reading a scanner's number as a fact about the page.
