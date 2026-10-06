// The chore dialog: markup and the listeners that are fixed for its lifetime.
// It serves two purposes - creating a chore (every field) and editing one
// (title, description, due date only, because donetick.update_task takes no
// more than that). Everything that depends on card state (members, error text,
// busy flag) is applied afterwards by the card's _updateDialog.

// The picker and the validation share this list so the two cannot drift apart.
// "interval" and "days_of_the_week" carry their own fields below; the
// remaining donetick.create_chore types (adaptive, day_of_the_month, trigger,
// no_repeat) are left out because the card has no sensible input for them.
export const FREQUENCY_TYPES = ["once", "daily", "weekly", "monthly", "yearly", "interval", "days_of_the_week"];
export const FREQUENCY_VALUES = new Set(FREQUENCY_TYPES);

// Units Donetick's scheduler accepts for an interval chore ("hours" exists
// too, but is of no use for household chores on a wall tablet).
export const INTERVAL_UNITS = ["days", "weeks", "months", "years"];
export const INTERVAL_UNIT_VALUES = new Set(INTERVAL_UNITS);

// Lower-case English weekday names - that is what Donetick compares against.
export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const WEEKDAY_VALUES = new Set(WEEKDAYS);

export const PRIORITIES = [0, 1, 2, 3, 4, 5];

// <label>Text<control></label> - wrapping the control avoids a for/id pair,
// which inside a shadow root would only ever be locally scoped anyway.
function labelled(caption, control) {
  const label = document.createElement("label");
  label.append(caption, control);
  return label;
}

/**
 * Builds the dialog. `t` translates keys; the callbacks connect it to the card.
 * `mode` is "create" or "edit".
 *
 * @param {{
 *   t: (key: string, params?: object) => string,
 *   mode?: "create" | "edit",
 *   onClose: () => void,
 *   onSubmit: (values: object) => void,
 *   onSelectMember: (userId: number) => void,
 *   trapFocus: (event: KeyboardEvent, section: HTMLElement) => void,
 * }} options
 */
export function createDialog({ t, mode = "create", onClose, onSubmit, onSelectMember, trapFocus }) {
  const editing = mode === "edit";

  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.setAttribute("role", "presentation");

  const section = document.createElement("section");
  section.className = "dialog";
  section.setAttribute("role", "dialog");
  section.setAttribute("aria-modal", "true");
  section.setAttribute("aria-labelledby", "new-task-title");

  const header = document.createElement("div");
  header.className = "dialog-header";
  const heading = document.createElement("h2");
  heading.id = "new-task-title";
  heading.textContent = editing ? t("dialog.title_edit") : t("dialog.title");
  const close = document.createElement("button");
  close.className = "dialog-close";
  close.type = "button";
  close.setAttribute("aria-label", t("dialog.close"));
  close.textContent = "×";
  header.append(heading, close);

  const form = document.createElement("form");
  form.className = "create-form";

  const title = document.createElement("input");
  title.name = "title";
  title.type = "text";
  title.maxLength = 255;
  title.required = true;

  const description = document.createElement("textarea");
  description.name = "description";
  description.rows = 3;

  const due = document.createElement("input");
  due.name = "due";
  due.type = "datetime-local";

  const frequencyType = document.createElement("select");
  frequencyType.name = "frequencyType";
  for (const value of FREQUENCY_TYPES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(`frequency.${value}`);
    frequencyType.append(option);
  }

  // "every N <unit>" - only shown for the interval type.
  const interval = document.createElement("input");
  interval.name = "interval";
  interval.type = "number";
  interval.min = "1";
  interval.step = "1";
  interval.inputMode = "numeric";
  interval.value = "1";
  const intervalUnit = document.createElement("select");
  intervalUnit.name = "intervalUnit";
  for (const value of INTERVAL_UNITS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(`unit.${value}`);
    intervalUnit.append(option);
  }
  const intervalRow = document.createElement("div");
  intervalRow.className = "interval-row";
  intervalRow.append(
    labelled(t("dialog.field_interval"), interval),
    labelled(t("dialog.field_interval_unit"), intervalUnit),
  );
  intervalRow.hidden = true;

  // Weekday toggles - only shown for days_of_the_week. Toggle buttons rather
  // than checkboxes: they give a 44 px tap target without a styled checkbox.
  const weekdayBox = document.createElement("fieldset");
  weekdayBox.className = "weekdays";
  const weekdayLegend = document.createElement("legend");
  weekdayLegend.textContent = t("dialog.field_weekdays");
  const weekdayRow = document.createElement("div");
  weekdayRow.className = "weekday-row";
  const weekdayButtons = new Map();
  for (const day of WEEKDAYS) {
    const button = document.createElement("button");
    button.className = "weekday";
    button.type = "button";
    button.dataset.weekday = day;
    button.textContent = t(`weekday.${day}`);
    button.title = t(`weekday.${day}_long`);
    button.setAttribute("aria-label", t(`weekday.${day}_long`));
    button.setAttribute("aria-pressed", "false");
    weekdayButtons.set(day, button);
    weekdayRow.append(button);
  }
  weekdayBox.append(weekdayLegend, weekdayRow);
  weekdayBox.hidden = true;

  const priority = document.createElement("select");
  priority.name = "priority";
  for (const value of PRIORITIES) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    priority.append(option);
  }

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = t("dialog.assignee");
  const memberBox = document.createElement("div");
  memberBox.className = "create-members";
  fieldset.append(legend, memberBox);

  const formError = document.createElement("div");
  formError.className = "form-error";
  formError.setAttribute("role", "alert");
  formError.hidden = true;

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = document.createElement("button");
  cancel.className = "cancel";
  cancel.type = "button";
  cancel.textContent = t("dialog.cancel");
  const save = document.createElement("button");
  save.className = "save";
  save.type = "submit";
  save.textContent = t("dialog.save");
  actions.append(cancel, save);

  form.append(
    labelled(t("dialog.field_title"), title),
    labelled(t("dialog.field_description"), description),
    labelled(t("dialog.field_due"), due),
  );
  if (editing) {
    // update_task cannot touch recurrence, priority or assignee; say so
    // instead of showing fields that would silently do nothing.
    const note = document.createElement("p");
    note.className = "edit-note";
    note.textContent = t("dialog.edit_note");
    form.append(note);
  } else {
    form.append(
      labelled(t("dialog.field_frequency"), frequencyType),
      intervalRow,
      weekdayBox,
      labelled(t("dialog.field_priority"), priority),
      fieldset,
    );
  }
  form.append(formError, actions);
  section.append(header, form);
  backdrop.append(section);

  const syncFrequencyFields = () => {
    intervalRow.hidden = frequencyType.value !== "interval";
    weekdayBox.hidden = frequencyType.value !== "days_of_the_week";
  };
  frequencyType.addEventListener("change", syncFrequencyFields);

  close.addEventListener("click", () => onClose());
  cancel.addEventListener("click", () => onClose());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) onClose();
  });
  backdrop.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Tab") trapFocus(event, section);
  });

  weekdayRow.addEventListener("click", (event) => {
    const button = event.target.closest?.("button.weekday");
    if (!button) return;
    const pressed = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!pressed));
    button.classList.toggle("selected", !pressed);
    formError.textContent = "";
    formError.hidden = true;
  });

  memberBox.addEventListener("click", (event) => {
    const button = event.target.closest?.("button.create-member");
    if (!button) return;
    for (const candidate of memberBox.querySelectorAll("button.create-member")) {
      const selected = candidate === button;
      candidate.classList.toggle("selected", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    }
    formError.textContent = "";
    formError.hidden = true;
    onSelectMember(Number(button.dataset.createUserId));
  });

  const selectedWeekdays = () =>
    WEEKDAYS.filter((day) => weekdayButtons.get(day).getAttribute("aria-pressed") === "true");

  const setWeekdays = (days) => {
    const wanted = new Set(days || []);
    for (const [day, button] of weekdayButtons) {
      const selected = wanted.has(day);
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("selected", selected);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit({
      title: title.value,
      description: description.value,
      due: due.value,
      frequencyType: frequencyType.value,
      interval: interval.value,
      intervalUnit: intervalUnit.value,
      weekdays: selectedWeekdays(),
      priority: priority.value,
    });
  });

  return {
    backdrop, section, mode, title, description, due, frequencyType,
    interval, intervalUnit, weekdayButtons, priority,
    memberBox, formError, save, memberKey: null,
    selectedWeekdays, setWeekdays, syncFrequencyFields,
  };
}
