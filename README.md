# Donetick Chores Card

A Lovelace card for [Home Assistant](https://www.home-assistant.io/) that lists
your Donetick chores and, when you tick one off, **asks who actually did it**.

Donetick tracks who completed what. Most task cards don't — they assume the
person tapping the screen is the person who did the work. On a shared wall
tablet that assumption is wrong most of the time.

The card's interface is available in German and English. It follows the
language set in Home Assistant, or the `language` option.

## What it does

- Lists open Donetick chores, sorted by due date, overdue ones highlighted
- Tapping the circle on the left opens the list of circle members; picking one
  books the chore through `donetick.complete_chore` with that person as
  `completed_by`
- If a chore is already assigned to someone, the circle shows their initial
- A dialog for adding chores — title, description, due date, recurrence
  (including *every N days/weeks/months/years* and *specific weekdays*),
  priority, assignee — through `donetick.create_chore`
- Editing (title, description, due date) through `donetick.update_task` and
  deleting with a confirmation step through `donetick.delete_task`, both from
  the expanded row
- An optional person filter (*All*, one chip per member, *Unassigned*) and an
  optional grouping by due date (*Overdue*, *Today*, *This week*, *Later*,
  *No due date*)
- A compact layout and a `max_items` limit for wall tablets
- A visual editor in the dashboard's card editor
- Initials expand to two characters when two members share a first letter
- Booked and deleted chores stay visibly marked until Donetick confirms, so
  nobody ticks the same chore twice out of uncertainty

## Requirements

The **Donetick integration** for Home Assistant, providing:

- one sensor per chore, prefixed `sensor.donetick_chores_`, with the attributes
  `task_id`, `is_active`, `next_due_date` and `assigned_to_user_id`
- a todo entity carrying `circle_members` and `config_entry_id`
- the services `donetick.complete_chore` and `donetick.create_chore`
  (completing and creating), plus `donetick.update_task` and
  `donetick.delete_task` for the edit and delete actions

The API token configured in the integration must belong to a **circle admin or
manager**. Without it, completing someone else's chore fails.

Note that `complete_chore` and `create_chore` are **not** part of the upstream
[donetick-hass-integration](https://github.com/donetick/donetick-hass-integration)
as of its version 2.0.1, which registers `complete_task`, `create_task`,
`update_task`, `delete_task` and `skip_task` only. The card was written against
an installation that adds the two chore services on top; the four `*_task`
services and the sensor attributes (`task_id`, `assigned_to_user_id`,
`next_due_date`, `frequency_type`, `frequency`, `priority`, `labels`,
`is_active`, `description`) are the upstream ones.

## Installation

### HACS

This repository isn't in the HACS default index. Add it as a custom repository:

1. In HACS, open the ⋮ menu → **Custom repositories**
2. Enter this repository's URL, category **Dashboard** (formerly *Plugin*)
3. Search for `Donetick Chores Card` and install it
4. Reload Home Assistant and clear your browser cache

HACS registers the resource for you.

### Manual

1. Copy `dist/donetick-chores-card.js` to `/config/www/`
2. Under *Settings → Dashboards → ⋮ → Resources*, add:
   - URL: `/local/donetick-chores-card.js?v=1`
   - Type: **JavaScript module**
3. Clear your browser cache

## Configuration

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
```

| Option | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `type` | string | yes | – | `custom:donetick-chores-card` |
| `todo_entity` | string | yes | – | The Donetick integration's todo entity. Supplies `circle_members` and `config_entry_id`. |
| `title` | string | no | `Aufgaben` / `Chores` | Heading shown on the card; the default follows the language |
| `sensor_prefix` | string | no | `sensor.donetick_chores_` | Prefix used to find the chore sensors |
| `language` | `de` \| `en` | no | – | Forces the card's language. Without it the card follows Home Assistant (see below). |
| `show_filters` | boolean | no | `false` | Shows the person filter above the list (see below). |
| `group_by` | `none` \| `due` | no | `none` | Groups the list by due date (see below). |
| `compact` | boolean | no | `false` | Tighter rows for wall tablets; tap targets stay at 44 px. |
| `max_items` | integer ≥ 1 | no | – | Shows at most this many chores and a *Show more* button for the rest. |

`setConfig` rejects a wrong type or value for any of these and names the
option in the error.

### Visual editor

The card registers an editor (`donetick-chores-card-editor`) for the
dashboard's *Edit card* dialog. It is an `ha-form` with one field per option:
the todo entity (entity picker limited to the `todo` domain), title, sensor
prefix, language, person filter, grouping, compact layout and `max_items`.
Options left at their default are not written into the YAML. The editor's
labels follow the `language` option, or Home Assistant's language.

### Person filter

With `show_filters: true` a row of chips sits above the list: *All*, one chip
per circle member, and *Unassigned*. Tapping a member shows the chores
assigned to that member; the counter follows the filter. The selection is kept
across data updates and title changes and dropped when the card is pointed at
another source or the member leaves the circle. The chips carry
`aria-pressed` and are at least 44 px high.

The filter is **off by default**: an existing dashboard must not gain a new
row of controls on an update, and a household with one or two members has no
use for it. Turn it on where several people share a tablet.

### Grouping

With `group_by: due` the list is split into *Overdue*, *Today*, *This week*
(the next six days), *Later* and *No due date* (which also takes chores whose
date cannot be read). Each heading names the number of chores in it; empty
groups are not shown; the counter in the header still counts everything. The
default `none` renders the flat list exactly as before.

### Language

The card picks its language in this order:

1. The `language` option, when set. Anything other than `de` or `en` is
   rejected by `setConfig`.
2. The language of the Home Assistant user (`hass.locale.language`, or
   `hass.language` on older frontends). Only the part before the dash counts,
   so `de-CH` is German and `en-GB` is English. A language the card has no
   translation for falls back to English.
3. German, when Home Assistant provides no language information at all.

A language change in Home Assistant's profile settings takes effect without a
reload; an open dialog keeps what was typed into it.

### Recurrence

The dialog offers *once*, *daily*, *weekly*, *monthly*, *yearly* (sent with
`frequency: 1`, as before), plus two types that take their own fields:

- **Every N days/weeks/months/years** — a number field and a unit. Sent as
  `frequency_type: interval`, `frequency: N` and
  `frequency_metadata: { unit, time, timezone }`. Donetick's validator
  requires `unit` for an interval chore; its scheduler reads `time`
  (RFC 3339) as the time of day. The card takes the time from the due date,
  or 18:00 today when none is given — the same default as Donetick's own
  form. The interval must be a whole number of 1 or more.
- **Specific weekdays** — seven toggle buttons. Sent as
  `frequency_type: days_of_the_week`, `frequency: 1` and
  `frequency_metadata: { days: ["monday", …], weekPattern: "every_week", time, timezone }`.
  At least one day must be picked.

`adaptive`, `day_of_the_month`, `trigger` and `no_repeat` stay out: the card
has no sensible input for them.

### Editing and deleting

An expanded row shows *Edit* and *Delete* under the member chooser.

- *Edit* opens the dialog with the chore's title, description and due date.
  `donetick.update_task` takes exactly these three fields, so recurrence,
  priority and assignee are not shown — a note in the dialog says they can
  only be changed in Donetick.
- *Delete* first asks *Really delete?* with *Yes, delete* / *Cancel*; only the
  second tap calls `donetick.delete_task`. The row is then held as
  "Deleted – waiting for Donetick …" until the sensor disappears (or two
  minutes pass), so nothing can be deleted or completed twice. Collapsing the
  row withdraws the question.

Both show a busy state while the call runs and report failures on the card and
as a Home Assistant notification, like completing does.

### Wall tablets

`compact: true` shrinks the header, row padding and font sizes so more chores
fit on one screen. The controls are not touched: every tap target stays at
44 px. `max_items: N` shows the first N chores (after the filter) and a *Show
more (x)* button for the rest; the counter still names all open chores.

### Full example

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
title: Haushalt
sensor_prefix: sensor.donetick_chores_
language: de
show_filters: true
group_by: due
compact: true
max_items: 8
```

## Limits

- **No undo.** The integration offers no service that reverts a completion
  (`skip_task` advances a recurring chore, it does not take a completion
  back), so the status banner has no *Undo* button. A mistaken completion has
  to be fixed in Donetick.
- **Editing is limited to title, description and due date**, because
  `donetick.update_task` accepts nothing else. A due date cannot be cleared
  through it either (`due_date` is only sent when set).
- **Failures inside the integration are invisible.** `update_task` and
  `delete_task` log errors on the Home Assistant side and return normally, so
  the card only learns of failures that Home Assistant itself raises
  (validation, missing service). If Donetick rejects a change, the row simply
  does not update.
- **Recurrence cannot be edited**, and the sensors carry no
  `frequency_metadata`, so an interval or weekday setting cannot be shown
  either.

## Accessibility and tablets

The card is built to run all day on a wall-mounted tablet:

- Every control offers a tap target of at least 44 × 44 px, including the
  filter chips, the weekday toggles and the edit/delete buttons. The member circles
  stay visually smaller than that on purpose — a row of five reads better that
  way — and reach the full size through a transparent pseudo-element instead.
- Hover states apply only to real pointing devices (`@media (hover: hover)`).
  On a touchscreen a hover state sticks after a tap until you tap somewhere
  else, which makes a button look jammed.
- Every `color-mix()` declaration has a plain fallback ahead of it. On older
  browsers an unsupported `color-mix()` drops the whole declaration, not just
  the effect.
- The dialog traps keyboard focus, closes on Escape, and returns focus to
  wherever it was before it opened.
- Focus survives data updates — the card doesn't rebuild its DOM.

## Development

The source lives in `src/` as ES modules; `dist/donetick-chores-card.js` is
generated from it by [esbuild](https://esbuild.github.io/) and is what Home
Assistant loads. HACS serves that file straight from the repository, so it is
committed - CI fails when it does not match `src/`.

```bash
npm install
npm run build # src/ → dist/donetick-chores-card.js
npm test      # builds first, then runs the test suite (jsdom) against dist/
npm run lint  # ESLint over src/, the tests and the build script
npm run check # syntax check of the built file
```

The workflow is: edit `src/`, run `npm test`, commit `src/` **and** the
rebuilt `dist/` together. Never edit `dist/` by hand - the next build would
overwrite it.

| File | Holds |
| --- | --- |
| `src/index.js` | Element registration and the card picker entry |
| `src/card.js` | The card itself: state, rendering, service calls |
| `src/editor.js` | The visual editor (`ha-form` schema, `config-changed`) |
| `src/dialog.js` | The create/edit dialog markup, the recurrence list, interval and weekday fields |
| `src/styles.js` | The stylesheet, shared across card instances |
| `src/dates.js` | Due date parsing and day arithmetic |
| `src/i18n.js` | Language selection and translation lookup |
| `src/locales/*.js` | One translation table per language |
| `scripts/build.mjs` | The esbuild call behind `npm run build` |

Requires Node 22.22.2 or newer (`.nvmrc` pins the major version for `nvm use`).
See [`test/README.md`](test/README.md) for how the tests are put together, and
the [changelog](CHANGELOG.md) for what changed when.

### Contributing a translation

1. Copy `src/locales/en.js` to `src/locales/<code>.js` (`<code>` being the
   two-letter language code Home Assistant uses, e.g. `nl`) and translate
   every value. Keep the keys and the `{placeholders}` exactly as they are;
   set `locale` to the BCP 47 tag used for date formatting and sorting.
2. Import the file in `src/i18n.js` and add it to `LOCALES`.
3. Run `npm test`. A test checks that every language carries exactly the same
   keys as `de.js`, so a forgotten line is caught right away.
4. Mention the language in the README's `language` option, rebuild and commit
   `dist/` along with the source.

A key missing from a language falls back to the German text rather than
breaking the card.

## Release

A release is a tag. Pushing one triggers
[`release.yml`](.github/workflows/release.yml), which runs the checks and
publishes a GitHub release with `dist/donetick-chores-card.js` attached. HACS
picks the release up from there.

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new heading
   `## [x.y.z] – YYYY-MM-DD`. The workflow takes that section as the release
   notes and fails if it cannot find one.
2. Set `"version"` in `package.json` to the same `x.y.z`. The workflow fails
   if the tag and the package version disagree.
3. Commit, then tag and push:

   ```bash
   git tag vx.y.z
   git push origin main vx.y.z
   ```

The workflow is the only one with `contents: write`, and only on its release
job. Everything else runs read-only.

## License

[MIT](LICENSE)
