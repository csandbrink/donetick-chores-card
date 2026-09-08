# Changelog

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung an [Semantic Versioning](https://semver.org/lang/de/).

## [1.1.0] – 2026-09-08

Vollständige Überarbeitung auf Grundlage eines Code Reviews. Die Konfiguration
der Karte ändert sich nicht – bestehende Dashboards laufen unverändert weiter.

### Behoben

- **Doppelte Erledigung.** Nach dem Buchen stand die Aufgabe unverändert und
  ohne Rückmeldung in der Liste, weil der Donetick-Coordinator den Sensor erst
  verzögert aktualisiert. Der zweite Klick ging als zweite Buchung durch. Die
  Karte führt gebuchte Aufgaben jetzt sichtbar als „Gebucht – warte auf
  Donetick …", bis die Buchung bestätigt ist.
- **Stumm verschluckte Klicks.** Solange eine Buchung lief, verwarf die Karte
  Klicks auf *jede* andere Aufgabe, ohne dass die Buttons gesperrt aussahen.
- **Fehlende Rückmeldung beim Erledigen.** Es gab Feedback nur im Fehlerfall.
- **Fehler beim Anlegen** erschienen nur im Dialog, nicht als HA-Benachrichtigung.
- **Beschnittener Dialog.** Der Dialog lag in der `ha-card`, die `overflow:
  hidden` trägt – ein `position: fixed`-Kind wird davon beschnitten, sobald ein
  Vorfahre einen Containing-Block aufspannt.
- **Kartengröße.** `getCardSize()` gab eine Konstante zurück, und
  `getGridOptions()` für das Sections-Layout fehlte ganz.
- **Fokusverlust.** Jedes Datenupdate baute das gesamte Shadow-DOM neu; wer
  gerade einen Button fokussiert hatte, verlor den Fokus.
- **Kein Fokus-Trap** trotz `aria-modal="true"` – Tab lief ins Dashboard
  darunter. Escape hing am Backdrop und war nach einem Re-Render wirkungslos.
- **`color-mix()` ohne Fallback.** Auf älteren Tablet-Browsern fiel damit nicht
  der Effekt aus, sondern die ganze Deklaration.
- **Hover-Zustände klebten** auf Touch-Geräten nach dem Antippen fest.
- **Touch-Ziele** von 34 px bzw. 38 px, unter der 44-px-Empfehlung.
- **Statusmeldung ohne Ende** – kein Timeout, kein Schließen-Knopf.
- **`getStubConfig()`** gab eine fest verdrahtete Entity zurück.
- **Unlesbare Fälligkeitsdaten** ergaben eine leere Zeile ohne Hinweis.
- **Zustand über einen Konfigwechsel hinweg**: aufgeklappte Zeile und gebuchte
  Aufgaben werden über die `task_id` geführt und passten nach einem Wechsel der
  Datenquelle nicht mehr zum Inhalt.
- **`new Event` mit angehängtem `detail`** statt `CustomEvent`.

### Geändert

- **Inkrementelles Rendering.** Das Grundgerüst entsteht einmal, danach werden
  nur noch geänderte Stellen angefasst. Zeilen werden über die `task_id`
  wiederverwendet.
- **Kein String-Templating mehr.** Alle Texte gehen über `textContent`; die
  Karte erzeugt kein HTML mehr aus Donetick-Daten. Ein vergessenes Escaping
  kann es damit nicht mehr geben.
- **Stylesheet einmal je Seite**, über `adoptedStyleSheets` von allen
  Karteninstanzen geteilt, mit `<style>`-Rückfall für ältere Engines.
- **Änderungserkennung ohne Signatur-String.** Referenzvergleich statt
  JSON-Serialisierung über alle Entities.
- **Wiederholungen**: zusätzlich monatlich und jährlich.
- **Testsuite** mit jsdom, in der CI ausgeführt.

## [1.0.0] – 2026-09-08

Erste Version als eigenständiges Repository, übernommen aus der bis dahin
inline in Home Assistant hinterlegten `data:`-Ressource.
