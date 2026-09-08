# Donetick Chores Card

A Lovelace card for [Home Assistant](https://www.home-assistant.io/) that lists
your Donetick chores and, when you tick one off, **asks who actually did it**.

Donetick tracks who completed what. Most task cards don't — they assume the
person tapping the screen is the person who did the work. On a shared wall
tablet that assumption is wrong most of the time.

The card's interface is in German.

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
| `title` | string | no | `Aufgaben` | Heading shown on the card |
| `sensor_prefix` | string | no | `sensor.donetick_chores_` | Prefix used to find the chore sensors |

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
```

## Accessibility and tablets

The card is built to run all day on a wall-mounted tablet:

- Every control is at least 44 × 44 px.
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

```bash
npm install
npm test      # test suite (jsdom)
npm run check # syntax check
```

Requires Node 22.22.2 or newer. See [`test/README.md`](test/README.md) for how
the tests are put together, and the [changelog](CHANGELOG.md) for what changed
when.

## License

[MIT](LICENSE)
