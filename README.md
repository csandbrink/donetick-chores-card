# Donetick Chores Card

Eine Lovelace-Karte für [Home Assistant](https://www.home-assistant.io/), die
Donetick-Aufgaben anzeigt und beim Abhaken **auswählen lässt, wer die Aufgabe
tatsächlich erledigt hat**.

Die Oberfläche ist deutschsprachig.

## Funktionen

- Liste der offenen Donetick-Chores, sortiert nach Fälligkeit
- Überfällige Aufgaben werden farblich hervorgehoben
- Klick auf den Kreis links klappt die Auswahl der Circle-Mitglieder auf –
  die Aufgabe wird dann über `donetick.complete_chore` mit `completed_by`
  auf die gewählte Person gebucht
- Ist eine Aufgabe bereits jemandem zugewiesen, zeigt der Kreis dessen Initiale
- Dialog zum Anlegen neuer Aufgaben (Titel, Beschreibung, Fälligkeit,
  Wiederholung, Priorität, Zuständigkeit) über `donetick.create_chore`
- Initialen werden bei Namensgleichheit automatisch auf zwei Zeichen erweitert
- Gebuchte Aufgaben bleiben sichtbar markiert, bis Donetick die Buchung
  bestätigt hat – damit niemand aus Unsicherheit ein zweites Mal abhakt

## Voraussetzungen

- Die **Donetick-Integration** für Home Assistant, die
  - pro Chore einen Sensor mit dem Präfix `sensor.donetick_chores_` anlegt
    (Attribute: `task_id`, `is_active`, `next_due_date`, `assigned_to_user_id`)
  - eine Todo-Entity mit den Attributen `circle_members` und `config_entry_id`
    bereitstellt
  - die Services `donetick.complete_chore` und `donetick.create_chore` registriert
- Der in der Integration hinterlegte API-Token muss einem **Circle-Admin oder
  -Manager** gehören, sonst schlägt das Abschließen fremder Aufgaben fehl.

## Installation

### Über HACS (empfohlen)

Dieses Repository ist nicht im HACS-Standardindex. Es lässt sich als
*Custom Repository* hinzufügen:

1. In HACS oben rechts auf **⋮ → Benutzerdefinierte Repositories**
2. URL dieses Repositories eintragen, Kategorie **Dashboard** (früher: *Plugin*)
3. `Donetick Chores Card` suchen und installieren
4. Home Assistant neu laden (Browser-Cache leeren)

HACS trägt die Ressource automatisch ein.

### Manuell

1. `dist/donetick-chores-card.js` nach `/config/www/` kopieren
2. Unter *Einstellungen → Dashboards → ⋮ → Ressourcen* eintragen:
   - URL: `/local/donetick-chores-card.js?v=1`
   - Typ: **JavaScript-Modul**
3. Browser-Cache leeren

## Konfiguration

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
```

| Option          | Typ    | Pflicht | Standard                   | Beschreibung |
| --------------- | ------ | ------- | -------------------------- | ------------ |
| `type`          | string | ja      | –                          | `custom:donetick-chores-card` |
| `todo_entity`   | string | ja      | –                          | Todo-Entity der Donetick-Integration. Liefert `circle_members` und `config_entry_id`. |
| `title`         | string | nein    | `Aufgaben`                 | Überschrift der Karte |
| `sensor_prefix` | string | nein    | `sensor.donetick_chores_`  | Präfix, nach dem die Aufgaben-Sensoren gesucht werden |

### Wiederholungen

Der Dialog bietet *einmalig*, *täglich*, *wöchentlich*, *monatlich* und
*jährlich*. Die übrigen Typen von `donetick.create_chore` (`adaptive`,
`interval`, `days_of_the_week`, `day_of_the_month`, …) brauchen zusätzlich
`frequency_metadata` und wären ohne eigene Eingabefelder eine Auswahl, die dann
nicht funktioniert.

### Beispiel mit allen Optionen

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
title: Haushalt
sensor_prefix: sensor.donetick_chores_
```

## Barrierefreiheit und Tablets

Die Karte ist für den Dauerbetrieb auf einem Wand-Tablet ausgelegt:

- Alle Bedienelemente sind mindestens 44 × 44 px groß.
- Hover-Zustände gelten nur für echte Zeigegeräte (`@media (hover: hover)`),
  damit sie auf Touch-Geräten nicht nach dem Antippen kleben bleiben.
- Jede `color-mix()`-Deklaration hat einen einfachen Fallback davor, damit auf
  älteren Browsern nicht die ganze Deklaration ausfällt.
- Der Dialog fängt den Tastaturfokus, lässt sich mit Escape schließen und gibt
  den Fokus danach dorthin zurück, wo er vorher war.
- Der Fokus überlebt Datenupdates – die Karte baut ihr DOM nicht neu auf.

## Entwicklung

```bash
npm install
npm test      # Testsuite (jsdom)
npm run check # Syntaxprüfung
```

Zum Aufbau der Tests siehe [`test/README.md`](test/README.md).
Änderungen sind im [Changelog](CHANGELOG.md) festgehalten.

## Lizenz

[MIT](LICENSE)
