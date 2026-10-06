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
- A dialog for adding chores — title, description, due date, recurrence,
  priority, assignee — through `donetick.create_chore`
- Initials expand to two characters when two members share a first letter
- Booked chores stay visibly marked until Donetick confirms, so nobody ticks
  the same chore twice out of uncertainty

## Requirements

The **Donetick integration** for Home Assistant, providing:

- one sensor per chore, prefixed `sensor.donetick_chores_`, with the attributes
  `task_id`, `is_active`, `next_due_date` and `assigned_to_user_id`
- a todo entity carrying `circle_members` and `config_entry_id`
- the services `donetick.complete_chore` and `donetick.create_chore`

The API token configured in the integration must belong to a **circle admin or
manager**. Without it, completing someone else's chore fails.

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

The dialog offers *once*, *daily*, *weekly*, *monthly* and *yearly*. The
remaining `donetick.create_chore` types (`adaptive`, `interval`,
`days_of_the_week`, `day_of_the_month`, …) all need `frequency_metadata` as
well. Offering them without fields to fill that in would mean offering choices
that then don't work.

### Full example

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
title: Haushalt
sensor_prefix: sensor.donetick_chores_
language: de
```

## Accessibility and tablets

The card is built to run all day on a wall-mounted tablet:

- Every control offers a tap target of at least 44 × 44 px. The member circles
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
| `src/dialog.js` | The "new chore" dialog markup and the recurrence list |
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
