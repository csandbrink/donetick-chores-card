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

### Beispiel mit allen Optionen

```yaml
type: custom:donetick-chores-card
todo_entity: todo.all_tasks
title: Haushalt
sensor_prefix: sensor.donetick_chores_
```

## Lizenz

[MIT](LICENSE)
