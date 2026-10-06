// The "new chore" dialog: markup and the listeners that are fixed for its
// lifetime. Everything that depends on card state (members, error text, busy
// flag) is applied afterwards by the card's _updateDialog.

// The picker and the validation share this list so the two cannot drift apart.
// donetick.create_chore knows further types (adaptive, interval,
// days_of_the_week, ...), but each of them also needs frequency_metadata and
// makes no sense without a field to fill that in.
export const FREQUENCY_TYPES = ["once", "daily", "weekly", "monthly", "yearly"];
export const FREQUENCY_VALUES = new Set(FREQUENCY_TYPES);

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
 *
 * @param {{
 *   t: (key: string, params?: object) => string,
 *   onClose: () => void,
 *   onSubmit: (values: object) => void,
 *   onSelectMember: (userId: number) => void,
 *   trapFocus: (event: KeyboardEvent, section: HTMLElement) => void,
 * }} options
 */
export function createDialog({ t, onClose, onSubmit, onSelectMember, trapFocus }) {
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
  heading.textContent = t("dialog.title");
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
    labelled(t("dialog.field_frequency"), frequencyType),
    labelled(t("dialog.field_priority"), priority),
    fieldset,
    formError,
    actions,
  );
  section.append(header, form);
  backdrop.append(section);

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit({
      title: title.value,
      description: description.value,
      due: due.value,
      frequencyType: frequencyType.value,
      priority: priority.value,
    });
  });

  return {
    backdrop, section, title, description, due, frequencyType, priority,
    memberBox, formError, save, memberKey: null,
  };
}
