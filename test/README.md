# Tests

Die Karte wird mit [jsdom](https://github.com/jsdom/jsdom) in einer echten
DOM-Umgebung geladen und über ihre öffentliche Schnittstelle angesprochen –
also so, wie Home Assistant es tut: `setConfig(...)`, dann `hass = ...`.
Es wird nichts nachgebaut und nichts gemockt, was die Karte selbst tut.

```bash
npm install
npm test
```

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `helpers.mjs` | Lädt die Karte in eine frische jsdom-Umgebung, baut hass-Objekte |
| `rendering.test.mjs` | Darstellung, Stylesheet-Handhabung, DOM-Stabilität |
| `interaction.test.mjs` | Erledigen, Dialog, Fehlerfälle |
| `logic.test.mjs` | Datums- und Initialenlogik, Änderungserkennung, Buchungs-Nachlauf |

## Warum `withStates`

Home Assistant tauscht bei jedem Update das `states`-Objekt aus, behält aber
die State-Objekte unveränderter Entities per Referenz bei. Genau darauf stützt
sich die Änderungserkennung der Karte. `withStates(hass, {...})` bildet dieses
Verhalten nach: nur die angefassten Entities bekommen eine neue Referenz.
Wer stattdessen das ganze hass-Objekt tief kopiert, testet etwas anderes als
das, was im Browser passiert.
