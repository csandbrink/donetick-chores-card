# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

## [1.1.2] – 2026-09-08

### Changed

- **The "Erledigt von" row now lines up with the circle above it** instead of
  with the task name. It was indented 50 px, which put the label out in the
  middle of the row with nothing above it. It sits at 8 px now — the check
  button is 44 px wide but the circle drawn inside it is 27 px and centred, so
  the circle itself starts 8.5 px in. A test ties the indent to that
  measurement so the two cannot drift apart.

## [1.1.1] – 2026-09-08

### Fixed

- **The status bar was permanently visible and empty.** Giving `.status`
  `display: flex` beat the `hidden` attribute, which only carries
  `display: none` from the browser stylesheet, so an empty green box sat above
  the list at all times. Every class the card hides now has a `[hidden]`
  override, and a test checks all of them.

### Changed

- **The member circles are back to their original size.** Growing them to fill
  a 44 px tap target made a row of five look clumsy. The circles are 36 px as
  before; the 44 px tap target comes from a transparent pseudo-element that
  overhangs them.
- Documentation, code comments and test names are now in English. The card's
  own interface stays German.

## [1.1.0] – 2026-09-08

A full pass over the card following a code review. **The card's configuration
is unchanged** — existing dashboards keep working as they are.

### Fixed

- **Double completion.** After booking a chore it sat in the list unchanged and
  without any acknowledgement, because the Donetick coordinator only refreshes
  the sensor a moment later. The second tap went through as a second booking.
  Booked chores are now held as "Gebucht – warte auf Donetick …" until Donetick
  confirms.
- **Silently swallowed taps.** While one booking was in flight, the card
  discarded taps on *every* other chore, and nothing about those buttons looked
  disabled.
- **No acknowledgement on completion.** Feedback only ever appeared on failure.
- **Errors when adding a chore** showed up in the dialog only, never as a Home
  Assistant notification.
- **Clipped dialog.** It lived inside the `ha-card`, which carries
  `overflow: hidden`. A `position: fixed` child gets clipped by that as soon as
  any ancestor establishes a containing block.
- **Card sizing.** `getCardSize()` returned a constant, and `getGridOptions()`
  for the sections layout was missing entirely.
- **Lost focus.** Every data update rebuilt the whole shadow DOM, so anyone who
  had a button focused lost it.
- **No focus trap** despite `aria-modal="true"` — Tab walked straight into the
  dashboard underneath. Escape was bound to the backdrop and stopped working
  after a re-render.
- **`color-mix()` without a fallback.** On older tablet browsers that drops the
  entire declaration, not just the effect.
- **Hover states stuck** on touch devices after a tap.
- **Touch targets** of 34 px and 38 px, below the 44 px guideline.
- **Status message that never left** — no timeout, no dismiss button.
- **`getStubConfig()`** returned a hard-coded entity id.
- **Unreadable due dates** rendered as an empty line with no explanation.
- **State surviving a config change.** The expanded row and booked chores are
  tracked by `task_id`; after switching to a different data source those ids
  refer to chores that don't exist there.
- **`new Event` with `detail` attached afterwards** instead of `CustomEvent`.

### Changed

- **Incremental rendering.** The shell is built once; after that only what
  actually changed gets touched. Rows are reused by `task_id`.
- **No more string templating.** All text goes through `textContent`, so the
  card no longer turns Donetick data into markup. Forgetting to escape
  something is no longer possible.
- **Stylesheet parsed once per page** and shared across card instances via
  `adoptedStyleSheets`, falling back to a `<style>` element on older engines.
- **Change detection without a signature string.** Comparing references instead
  of serialising every entity to JSON: 163 µs → 89 µs per state update across
  roughly 1500 entities, and none of the intermediate objects.
- **Recurrence**: monthly and yearly added.
- **Test suite** using jsdom, 72 tests, run in CI.

## [1.0.0] – 2026-09-08

First release as a standalone repository, lifted out of the `data:` resource
that had been registered inline in Home Assistant until then.
