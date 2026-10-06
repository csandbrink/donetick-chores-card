# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Due dates given as a bare `YYYY-MM-DD` are read as a local calendar day
  instead of UTC midnight (off by one day west of UTC).
- A chore due earlier today is no longer shown in the overdue colour while the
  text says "Heute fällig"; both use day granularity now.
- Chores with an unparsable `next_due_date` no longer break the sort order.
- `setConfig` validates `todo_entity` (must be `todo.…`), `title` and
  `sensor_prefix` (non-empty text) and reports mistakes instead of rendering
  `[object Object]` or listing foreign sensors.
- States without `attributes` no longer break the whole card.
- A booking that finishes after the card was pointed at another source is
  discarded; the "booked" state also expires without a further hass update.
- The member list and the "no users" notice stay current while the create
  dialog is open; Escape no longer propagates to Home Assistant.
- No status timer is started on a card that was already removed.

### Added

- **Visual editor.** `getConfigElement()` returns
  `donetick-chores-card-editor`, an `ha-form` with one field per option: the
  todo entity (entity picker limited to `todo`), title, sensor prefix,
  language, person filter, grouping, compact layout and `max_items`. It fires
  `config-changed`, leaves defaults out of the YAML and is labelled in the
  card's language. `getStubConfig()` is unchanged.
- **Person filter** (`show_filters: true`, off by default): chips for *All*,
  each circle member and *Unassigned* above the list, with `aria-pressed` and
  44 px tap targets. The selection survives data updates, follows a member who
  leaves back to *All*, and is dropped on a source switch. The counter follows
  the filter.
- **Grouping by due date** (`group_by: due`, default `none`): *Overdue*,
  *Today*, *This week*, *Later*, *No due date*, with translated headings that
  name the count; empty groups are hidden, row nodes are reused when a chore
  moves between groups.
- **Real intervals and weekdays** in the create dialog: *every N
  days/weeks/months/years* (`frequency_type: interval`, `frequency: N`,
  `frequency_metadata: { unit, time, timezone }`) and *specific weekdays*
  (`frequency_type: days_of_the_week`, `frequency_metadata: { days,
  weekPattern: "every_week", time, timezone }`), as Donetick's validator and
  scheduler expect them. The interval must be a whole number of 1 or more, at
  least one weekday must be picked; both are reported in the dialog. The
  existing types still send `frequency: 1`.
- **Edit and delete** in the expanded row. *Edit* reuses the dialog with
  title, description and due date - all that `donetick.update_task` accepts -
  and says so. *Delete* asks *Really delete?* first and only then calls
  `donetick.delete_task`; the row is held as deleted until the sensor
  disappears. Both have busy and error states like completing.
- **Wall-tablet options:** `compact: true` for tighter rows without touching
  the 44 px tap targets, and `max_items: N` with a *Show more / Show less*
  button.
- Every new option is validated in `setConfig` with a translated error.
- A "Limits" section in the README: no undo (the integration has no service
  for it), editing restricted to what `update_task` takes, and integration-side
  failures of `update_task`/`delete_task` being logged rather than raised.
- Tests for the editor, filter, grouping, recurrence payloads and validation,
  edit and delete (including confirmation, busy, failure, source switch and
  expiry), compact mode, `max_items` and the new config checks, in German and
  English. 195 tests now.
- **English.** The card's interface is available in German and English. It
  follows the Home Assistant user's language (`hass.locale.language`, or
  `hass.language` on older frontends; `de-CH` counts as German, `en-GB` as
  English, anything the card lacks as English) and switches at runtime when
  that setting changes, re-translating what is on screen and keeping the input
  of an open dialog. Without any language information the card stays German.
  The new `language` option (`de` or `en`) forces a language; `setConfig`
  rejects anything else. Dates are formatted for the language. All interface
  text, including aria-labels, error and status messages, lives in
  `src/locales/`; a missing key falls back to German. Adding a language means
  adding one file - documented in the README.
- Tests for the English output, the language selection, the `language`
  option, the runtime switch, and that every locale file carries exactly the
  same keys.
- Release workflow: pushing a `v*` tag runs the checks, verifies the tag
  against `package.json`, and publishes a GitHub release with
  `dist/donetick-chores-card.js` attached and the matching changelog section
  as release notes. Documented under "Release" in the README.
- Tests for the `create_chore` error path, several cards on one page, a
  source switch while a booking is in flight, member updates with the dialog
  open, an invalid due date in the dialog, odd `assigned_to_user_id` values
  (`0`, negative, string) and the expiry of the "booked" state without a hass
  update.

### Changed

- The README now states which services the card needs and that
  `complete_chore`/`create_chore` are not part of the upstream integration
  (2.0.1 registers `complete_task`, `create_task`, `update_task`,
  `delete_task` and `skip_task`).
- The recurrence picker lists *Every N days/weeks/months/years* and *Specific
  weekdays* after *Yearly*; the dialog's focus trap skips the hidden
  recurrence fields.
- **The source now lives in `src/`** as ES modules (`index.js`, `card.js`,
  `dialog.js`, `styles.js`, `dates.js`, `i18n.js`, `locales/`), bundled by
  esbuild into the single, unminified `dist/donetick-chores-card.js` that Home
  Assistant loads. `dist/` stays committed for HACS; `npm run build` produces
  it, `npm test` builds before running, and CI fails when the committed file
  does not match `src/`. The release workflow builds and checks the same way.
  No change in behaviour or configuration.
- ESLint lints `src/` as browser ES modules and ignores the generated `dist/`.
- The card picker entry ("Donetick Chores") follows the language of the page
  (`<html lang>`), which Home Assistant sets to the user's language.
- ESLint (`eslint:recommended`, flat config) with `npm run lint`, run in CI.
  The two findings it raised - an unused catch binding in the card and an
  unused import in a test - are fixed.
- `.nvmrc` pins Node 22; the workflows read it instead of carrying their own
  copy of the version.

### Security / CI

- Workflow: `permissions: contents: read`, concurrency group, push filter;
  Dependabot for GitHub Actions and npm.
- `npm audit --omit=dev --audit-level=high` in CI, so a runtime dependency
  with a known vulnerability cannot slip in unnoticed.

## [1.1.3] – 2026-09-08

### Fixed

- **The circle in front of a chore changed size depending on whether anyone was
  assigned.** The badge showing an assignee's initial was sized to the icon box
  rather than to the circle the icon actually draws — MDI's outline circles have
  radius 10 in a 24-unit viewBox, so the drawn circle is 20/24 of the box — and
  its border was added on top of that width. Measured in a browser: 32 px with
  an assignee against 22.5 px without. Both are 22.5 px now, and the badge size
  derives from the icon size so the two cannot drift apart again.

### Changed

- **A chore without a due date now shows nothing** instead of "Ohne Termin".
  The empty line is hidden rather than left blank, so it takes no space.

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
