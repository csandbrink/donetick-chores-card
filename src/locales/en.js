// English. Keys must match de.js exactly; a test checks that.
//
// Placeholders in braces ({name}, {count}, ...) are filled in by i18n.js.
export default {
  // BCP 47 tag for Intl, localeCompare and toLocaleUpperCase.
  locale: "en-US",

  "card.title_default": "Chores",
  "card.add": "Add chore",
  "card.dismiss_status": "Dismiss message",
  "card.loading": "Loading chores …",
  "card.empty": "No open chores",
  "card.open_count": "{count} open",

  "row.booked_waiting": "Booked – waiting for Donetick …",
  "row.already_booked": "Already booked",
  "row.pick_completer": "Choose who did it",
  "row.was_booked": "{task} has been booked",
  "row.pick_completer_for": "Choose who did {task}",
  "row.completed_by": "Done by",
  "row.completed_by_member": "Done by {name}",

  "due.invalid": "Invalid due date",
  "due.overdue_days": "Overdue by {days} days",
  "due.overdue_yesterday": "Due since yesterday",
  "due.today": "Due today",
  "due.tomorrow": "Due tomorrow",
  "due.on": "Due {date}",

  "frequency.once": "Once",
  "frequency.daily": "Daily",
  "frequency.weekly": "Weekly",
  "frequency.monthly": "Monthly",
  "frequency.yearly": "Yearly",

  "dialog.title": "New chore",
  "dialog.close": "Close dialog",
  "dialog.field_title": "Title",
  "dialog.field_description": "Description",
  "dialog.field_due": "Due on",
  "dialog.field_frequency": "Repeat",
  "dialog.field_priority": "Priority",
  "dialog.assignee": "Assigned to",
  "dialog.select_member": "Select {name}",
  "dialog.cancel": "Cancel",
  "dialog.save": "Save",
  "dialog.saving": "Saving …",

  "error.title_required": "Please enter a title.",
  "error.member_unavailable": "The selected Donetick user is no longer available.",
  "error.config_entry_missing": "The Donetick config entry id is missing. Please reload the integration.",
  "error.due_invalid": "The due date is invalid.",
  "error.no_users": "No Donetick users available. Please reload the integration.",
  "error.create_failed": "The chore could not be added: {message}",
  "error.complete_failed": "The chore could not be completed: {message}",

  "status.created": "Chore added.",
  "status.completed_by": "“{task}” – done by {name}.",
  "status.completed": "“{task}” has been booked as done.",
  "status.task_fallback": "Chore",

  "config.todo_entity_required": "todo_entity is required",
  "config.todo_entity_type": "todo_entity must be a todo entity (todo.…)",
  "config.title_type": "title must be a string",
  "config.sensor_prefix_type": "sensor_prefix must be a non-empty string",
  "config.language_invalid": "language must be one of: {languages}",

  "picker.name": "Donetick Chores",
  "picker.description": "Donetick chores that ask who actually did the work",
};
