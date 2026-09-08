# Tests

The card is loaded into a real DOM through [jsdom](https://github.com/jsdom/jsdom)
and driven through its public interface, the same way Home Assistant drives it:
`setConfig(...)`, then `hass = ...`. Nothing the card does is reimplemented or
mocked.

Requires **Node 22.22.2 or newer** — that's what jsdom 30 needs.

```bash
npm install
npm test
```

## Layout

| File | Covers |
| --- | --- |
| `helpers.mjs` | Loads the card into a fresh jsdom environment, builds hass objects |
| `rendering.test.mjs` | Rendering, stylesheet handling, DOM stability, stylesheet rules |
| `interaction.test.mjs` | Completing chores, the dialog, error paths, status messages |
| `logic.test.mjs` | Date and initial handling, change detection, post-booking follow-up |

## Why `withStates`

Home Assistant swaps the `states` object on every update but keeps the state
objects of unchanged entities by reference. The card's change detection relies
on exactly that. `withStates(hass, {...})` reproduces it: only the entities you
touch get a new reference.

Deep-copying the whole hass object instead would test something the browser
never does.

## Why `plain`

Objects created inside the jsdom realm carry jsdom's prototypes.
`assert.deepStrictEqual` compares prototypes too and fails even when the
contents match, so `plain(value)` takes a JSON round trip first.
