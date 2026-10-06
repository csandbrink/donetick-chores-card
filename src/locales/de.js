// German - the card's original language and the fallback for every key that a
// translation leaves out. Keys must match en.js exactly; a test checks that.
//
// Placeholders in braces ({name}, {count}, ...) are filled in by i18n.js.
export default {
  // BCP 47 tag for Intl, localeCompare and toLocaleUpperCase.
  locale: "de-DE",

  "card.title_default": "Aufgaben",
  "card.add": "Aufgabe hinzufügen",
  "card.dismiss_status": "Meldung schließen",
  "card.loading": "Lade Aufgaben …",
  "card.empty": "Keine offenen Aufgaben",
  "card.open_count": "{count} offen",

  "row.booked_waiting": "Gebucht – warte auf Donetick …",
  "row.already_booked": "Bereits gebucht",
  "row.pick_completer": "Erlediger auswählen",
  "row.was_booked": "{task} wurde gebucht",
  "row.pick_completer_for": "Erlediger für {task} auswählen",
  "row.completed_by": "Erledigt von",
  "row.completed_by_member": "Erledigt von {name}",

  "due.invalid": "Termin ungültig",
  "due.overdue_days": "Seit {days} Tagen fällig",
  "due.overdue_yesterday": "Seit gestern fällig",
  "due.today": "Heute fällig",
  "due.tomorrow": "Morgen fällig",
  "due.on": "Fällig {date}",

  "frequency.once": "Einmalig",
  "frequency.daily": "Täglich",
  "frequency.weekly": "Wöchentlich",
  "frequency.monthly": "Monatlich",
  "frequency.yearly": "Jährlich",

  "dialog.title": "Neue Aufgabe",
  "dialog.close": "Dialog schließen",
  "dialog.field_title": "Titel",
  "dialog.field_description": "Beschreibung",
  "dialog.field_due": "Fällig am",
  "dialog.field_frequency": "Wiederholung",
  "dialog.field_priority": "Priorität",
  "dialog.assignee": "Zuständig",
  "dialog.select_member": "{name} auswählen",
  "dialog.cancel": "Abbrechen",
  "dialog.save": "Speichern",
  "dialog.saving": "Speichert …",

  "error.title_required": "Bitte einen Titel eingeben.",
  "error.member_unavailable": "Die ausgewählte Donetick-Person ist nicht mehr verfügbar.",
  "error.config_entry_missing": "Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.",
  "error.due_invalid": "Das Fälligkeitsdatum ist ungültig.",
  "error.no_users": "Keine Donetick-Benutzer verfügbar. Bitte die Integration neu laden.",
  "error.create_failed": "Aufgabe konnte nicht hinzugefügt werden: {message}",
  "error.complete_failed": "Aufgabe konnte nicht abgeschlossen werden: {message}",

  "status.created": "Aufgabe wurde hinzugefügt.",
  "status.completed_by": "„{task}\" – erledigt von {name}.",
  "status.completed": "„{task}\" wurde als erledigt gebucht.",
  "status.task_fallback": "Aufgabe",

  "config.todo_entity_required": "todo_entity ist erforderlich",
  "config.todo_entity_type": "todo_entity muss eine todo-Entität sein (todo.…)",
  "config.title_type": "title muss ein Text sein",
  "config.sensor_prefix_type": "sensor_prefix muss ein nicht leerer Text sein",
  "config.language_invalid": "language muss eine dieser Sprachen sein: {languages}",

  "picker.name": "Donetick Aufgaben",
  "picker.description": "Donetick-Aufgaben mit Auswahl des Erledigers",
};
