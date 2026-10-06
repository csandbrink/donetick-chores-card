# Tests

The card is loaded into a real DOM through [jsdom](https://github.com/jsdom/jsdom)
and driven through its public interface, the same way Home Assistant drives it:
`setConfig(...)`, then `hass = ...`. Nothing the card does is reimplemented or
mocked.

Requires **Node 22.22.2 or newer** — that's what jsdom 30 needs.

```bash
npm install
npm test       # builds dist/ first (pretest), then runs the suite against it
npm run lint   # ESLint over src/, the tests and the build script
```

The tests load the **built** file, `dist/donetick-chores-card.js`, not the
modules in `src/` - that is the file Home Assistant runs, and the bundle is
what has to work. `npm test` rebuilds it first, so a change in `src/` is always
tested. Only `i18n.test.mjs` imports from `src/` directly, for the pure
functions in `i18n.js` and the locale tables.

CI runs `build`, checks that the committed `dist/` matches
(`git diff --exit-code dist/`), then `check`, `lint`, `test` and an
`npm audit` over runtime dependencies - of which there are none, so that step
only ever catches a package added by mistake.

Two card timeouts are static class properties (`statusTimeoutMs`,
`completedTimeoutMs`) so tests can shorten them. `loadCard()` gives every test
its own window and therefore its own copy of the class, so changing one does
not leak into another test.

## Layout

| File | Covers |
| --- | --- |
| `helpers.mjs` | Loads the card into a fresh jsdom environment, builds hass objects |
| `rendering.test.mjs` | Rendering, stylesheet handling, DOM stability, stylesheet rules |
| `interaction.test.mjs` | Completing chores, the dialog, error paths, status messages |
| `logic.test.mjs` | Date and initial handling, change detection, post-booking follow-up |
| `i18n.test.mjs` | Locale key parity, language selection, English output, language switch at runtime |
| `features.test.mjs` | The visual editor, person filter, grouping, interval/weekday recurrence, edit and delete, compact mode, `max_items`, validation of the new options |

## Language in tests

A hass object built by `makeHass()` carries no language information, so the
card renders in German - every test written before the card learned English
holds unchanged. English is requested the way the Home Assistant frontend does
it: `{ ...makeHass(...), locale: { language: "en" } }`, or through the
`language` config option.

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
