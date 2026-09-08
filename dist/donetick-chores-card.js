// The picker and the validation share this list so the two cannot drift apart.
// donetick.create_chore knows further types (adaptive, interval,
// days_of_the_week, ...), but each of them also needs frequency_metadata and
// makes no sense without a field to fill that in.
const FREQUENCY_TYPES = [
  { value: "once", label: "Einmalig" },
  { value: "daily", label: "Täglich" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "monthly", label: "Monatlich" },
  { value: "yearly", label: "Jährlich" },
];
const FREQUENCY_VALUES = new Set(FREQUENCY_TYPES.map((entry) => entry.value));

// Parsed once per page and shared by every card instance, rather than written
// into the shadow root again on every render.
const STYLES = `
:host { display: block; }
ha-card { overflow: hidden; }
.header { padding: 14px 14px 10px 20px; display: flex; align-items: center; gap: 12px; }
.title { flex: 1; font-size: 1.25rem; font-weight: 600; color: var(--primary-text-color); }
.count { font-size: .82rem; color: var(--secondary-text-color); }
.add { width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
.add ha-icon { --mdc-icon-size: 25px; }
.list { padding: 0 10px 10px; }
.task { border-top: 1px solid var(--divider-color); padding: 8px 4px; transition: background .15s ease; }
.task:first-child { border-top: 0; }
.task.expanded { background: var(--secondary-background-color); background: color-mix(in srgb, var(--primary-color) 6%, transparent); border-radius: 12px; }
.task-main { min-height: 48px; display: flex; align-items: center; }
button { font: inherit; }
.check { width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
.check ha-icon { --mdc-icon-size: 27px; }
.assignee-initial { width: 28px; height: 28px; display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; font-size: .72rem; line-height: 1; font-weight: 700; }
.text { min-width: 0; padding: 3px 8px 3px 2px; }
.name { color: var(--primary-text-color); font-size: .98rem; line-height: 1.3; overflow-wrap: anywhere; }
.due { color: var(--secondary-text-color); font-size: .78rem; margin-top: 2px; }
.due.overdue { color: var(--error-color); }
.task.done .name { text-decoration: line-through; opacity: .55; }
.task.done .due { font-style: italic; }
.task.done .check { color: var(--success-color, #43a047); cursor: default; }
.chooser { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding: 4px 8px 8px 50px; }
.chooser-label { color: var(--secondary-text-color); font-size: .78rem; margin-right: 2px; }
.member { width: 44px; height: 44px; flex: 0 0 44px; border: 1px solid var(--primary-color); border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 50%; background: var(--card-background-color); background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; box-shadow: none; }
button:disabled { opacity: .55; cursor: wait; }
.empty, .loading { padding: 20px; color: var(--secondary-text-color); }
.spinner { width: 19px; height: 19px; border: 2px solid var(--divider-color); border-top-color: var(--primary-color); border-radius: 50%; animation: spin .8s linear infinite; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .48); }
.dialog { box-sizing: border-box; width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; border-radius: 18px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 16px 50px rgba(0, 0, 0, .35); }
.dialog-header { display: flex; align-items: center; padding: 18px 20px 8px; }
.dialog-header h2 { flex: 1; margin: 0; font-size: 1.25rem; }
.dialog-close { width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--secondary-text-color); font-size: 1.7rem; cursor: pointer; }
.create-form { display: grid; gap: 15px; padding: 10px 20px 20px; }
.create-form label { display: grid; gap: 6px; color: var(--secondary-text-color); font-size: .85rem; }
.create-form input, .create-form textarea, .create-form select { box-sizing: border-box; width: 100%; border: 1px solid var(--divider-color); border-radius: 10px; padding: 11px 12px; background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
.create-form input:focus, .create-form textarea:focus, .create-form select:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
.create-form fieldset { margin: 0; padding: 0; border: 0; }
.create-form legend { margin-bottom: 8px; color: var(--secondary-text-color); font-size: .85rem; }
.create-members { display: flex; flex-wrap: wrap; gap: 9px; }
.create-member { min-width: 44px; height: 44px; padding: 0 12px; border: 1px solid var(--primary-color); border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 22px; background: var(--card-background-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; }
.create-member.selected { background: var(--primary-color); color: var(--text-primary-color); }
.status-text { flex: 1; }
.status-close { flex: 0 0 auto; box-sizing: content-box; width: 28px; height: 28px; padding: 8px; margin: -8px -4px -8px 0; border: 0; border-radius: 50%; background: transparent; color: var(--primary-text-color); font-size: 1.2rem; line-height: 1; cursor: pointer; }
.form-error { border-radius: 10px; padding: 10px 12px; border: 1px solid var(--error-color); background: transparent; background: color-mix(in srgb, var(--error-color) 12%, transparent); color: var(--error-color); font-size: .85rem; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 2px; }
.dialog-actions button { min-height: 40px; border: 0; border-radius: 10px; padding: 0 16px; cursor: pointer; }
.cancel { background: transparent; color: var(--primary-text-color); }
.save { background: var(--primary-color); color: var(--text-primary-color); font-weight: 600; }
.status { display: flex; align-items: center; gap: 8px; margin: 0 14px 10px; border-radius: 10px; padding: 9px 12px; border: 1px solid var(--success-color, #43a047); background: transparent; background: color-mix(in srgb, var(--success-color, #43a047) 12%, transparent); color: var(--primary-text-color); font-size: .84rem; }
/* On a touchscreen a hover state sticks after a tap until you tap somewhere
   else, which on a wall tablet makes a button look permanently pressed. So:
   real pointing devices only. */
@media (hover: hover) and (pointer: fine) {
  .add:hover { background: var(--divider-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .check:hover:not(:disabled) { background: var(--divider-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .member:hover:not(:disabled) { background: var(--primary-color); color: var(--text-primary-color); transform: translateY(-1px); }
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 420px) {
  .header { padding-inline: 16px; }
  .chooser { padding-left: 46px; }
  .chooser-label { display: none; }
}
.chooser[hidden] { display: none; }
`;

let cachedStyleSheet;
function sharedStyleSheet() {
  if (cachedStyleSheet !== undefined) return cachedStyleSheet;
  try {
    if (typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLES);
      cachedStyleSheet = sheet;
      return cachedStyleSheet;
    }
  } catch (error) {
    // Older engines fall through to a <style> element below.
  }
  cachedStyleSheet = null;
  return cachedStyleSheet;
}

// <label>Text<control></label> - wrapping the control avoids a for/id pair,
// which inside a shadow root would only ever be locally scoped anyway.
function labelled(caption, control) {
  const label = document.createElement("label");
  label.append(caption, control);
  return label;
}

class DonetickChoresCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._expandedTaskId = null;
    this._busyTaskIds = new Set();
    this._dialogOpen = false;
    this._busyCreate = false;
    this._selectedCreateUserId = null;
    this._formError = "";
    this._statusMessage = "";
    this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
    this._completedTasks = new Map();
    this._dialog = null;
    this._focusBeforeDialog = null;
    this._statusTimer = null;
  }

  // Without this the timer still fires after the card has been removed from the
  // dashboard - switching views, or editing the dashboard.
  disconnectedCallback() {
    this._clearStatusTimer();
  }

  _clearStatusTimer() {
    if (!this._statusTimer) return;
    clearTimeout(this._statusTimer);
    this._statusTimer = null;
  }

  /**
   * Sets the message above the list. Success messages clear themselves; errors
   * stay until the user dismisses them or the next action replaces them.
   */
  _setStatus(message, { autoDismiss = true } = {}) {
    this._clearStatusTimer();
    this._statusMessage = message;
    if (!message || !autoDismiss) return;
    this._statusTimer = setTimeout(() => {
      this._statusTimer = null;
      this._statusMessage = "";
      this._render();
    }, this.constructor.statusTimeoutMs);
  }

  setConfig(config) {
    if (!config || !config.todo_entity) {
      throw new Error("todo_entity ist erforderlich");
    }
    const previous = this._config;
    this._config = {
      title: "Aufgaben",
      sensor_prefix: "sensor.donetick_chores_",
      ...config,
    };

    // Once the card points at a different source the existing state is useless
    // and partly misleading: the expanded row, the booked chores and any
    // in-flight bookings all refer to task_ids from the old source.
    const sourceChanged =
      previous &&
      (previous.todo_entity !== this._config.todo_entity ||
        previous.sensor_prefix !== this._config.sensor_prefix);
    if (sourceChanged) {
      this._expandedTaskId = null;
      this._completedTasks.clear();
      this._busyTaskIds.clear();
      this._setStatus("");
    }
    this._render();
  }

  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    if (previous && !this._relevantChange(previous, hass)) return;
    if (this._dialogOpen) return;
    this._render();
  }

  // Home Assistant swaps the states object on every update but keeps the state
  // objects of unchanged entities by reference. Comparing references for the
  // entities we care about is therefore enough - no intermediate arrays, no
  // sort, no JSON.stringify.
  _relevantChange(previous, next) {
    if (!this._config) return true;
    // HA also recreates the hass object when no state changed at all - theme,
    // connection status, panel switch.
    if (previous.states === next.states) return false;
    const previousStates = previous.states || {};
    const nextStates = next.states || {};
    if (previousStates[this._config.todo_entity] !== nextStates[this._config.todo_entity]) {
      return true;
    }
    const prefix = this._config.sensor_prefix;
    let nextCount = 0;
    for (const entityId in nextStates) {
      if (!entityId.startsWith(prefix)) continue;
      nextCount += 1;
      if (previousStates[entityId] !== nextStates[entityId]) return true;
    }
    let previousCount = 0;
    for (const entityId in previousStates) {
      if (entityId.startsWith(prefix)) previousCount += 1;
    }
    return previousCount !== nextCount;
  }

  // Masonry layout: height units of roughly 50 px. A header plus one row per
  // chore is far closer to the real height than a constant.
  // How long a success message stays up, in milliseconds.
  static statusTimeoutMs = 8000;

  getCardSize() {
    return 1 + this._tasks().length;
  }

  // Sections layout (HA 2024.11+): there getGridOptions drives the size and
  // getCardSize is not consulted at all. Without this method the card gets the
  // default tile size no matter how many chores it holds.
  getGridOptions() {
    return { rows: "auto", columns: "full", min_columns: 6 };
  }

  // HA calls getStubConfig(hass, entities, entitiesFallback) when the card is
  // created from the card picker. This used to return todo.all_tasks verbatim,
  // which only happens to fit an installation where the entity is named exactly
  // that.
  static getStubConfig(hass) {
    const states = hass?.states || {};
    const donetickTodo = Object.keys(states).find(
      (entityId) =>
        entityId.startsWith("todo.") &&
        Array.isArray(states[entityId]?.attributes?.circle_members)
    );
    return { todo_entity: donetickTodo || "todo.all_tasks", title: "Aufgaben" };
  }

  _tasks() {
    if (!this._hass || !this._config) return [];
    return Object.values(this._hass.states)
      .filter((state) =>
        state.entity_id?.startsWith(this._config.sensor_prefix) &&
        state.attributes.task_id != null &&
        state.attributes.is_active !== false
      )
      .sort((a, b) => {
        const dueA = a.attributes.next_due_date;
        const dueB = b.attributes.next_due_date;
        if (dueA && dueB) return new Date(dueA) - new Date(dueB);
        if (dueA) return -1;
        if (dueB) return 1;
        return String(a.state).localeCompare(String(b.state), "de");
      });
  }

  _members() {
    const todo = this._hass?.states?.[this._config?.todo_entity];
    return Array.isArray(todo?.attributes?.circle_members)
      ? todo.attributes.circle_members
      : [];
  }

  _configEntryId() {
    return this._hass?.states?.[this._config?.todo_entity]?.attributes?.config_entry_id;
  }

  _initial(name) {
    return String(name || "?").trim().charAt(0).toLocaleUpperCase("de");
  }

  _memberInitial(member, members) {
    const name = String(member?.display_name || "?").trim();
    const initial = this._initial(name);
    const collides = members.some((other) =>
      Number(other?.user_id) !== Number(member?.user_id) &&
      this._initial(other?.display_name) === initial
    );
    if (!collides) return initial;
    const chars = Array.from(name);
    return `${chars[0]?.toLocaleUpperCase("de") || "?"}${chars[1]?.toLocaleLowerCase("de") || ""}`;
  }

  _dueText(value) {
    if (!value) return "Ohne Termin";
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return "Termin ungültig";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const days = Math.round((dueDay - today) / 86400000);
    if (days < -1) return `Seit ${Math.abs(days)} Tagen fällig`;
    if (days === -1) return "Seit gestern fällig";
    if (days === 0) return "Heute fällig";
    if (days === 1) return "Morgen fällig";
    return `Fällig ${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(due)}`;
  }

  // HA listens globally for "hass-notification" and shows the message as a
  // toast. A plain Event has no detail field - attaching one as an ordinary
  // property does work in JavaScript, but it isn't the event semantics and
  // breaks the moment anyone clones or forwards the event.
  _notify(message) {
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message },
        bubbles: true,
        composed: true,
      })
    );
  }

  _isOverdue(value) {
    return Boolean(value) && new Date(value).getTime() < Date.now();
  }

  async _createTask({ title, description, due, userId, frequencyType = "once", priority = 0 }) {
    if (this._busyCreate) return;
    this._draft = {
      title: String(title || ""),
      description: String(description || ""),
      due: String(due || ""),
      frequencyType: String(frequencyType || "once"),
      priority: String(priority ?? 0),
    };
    const cleanTitle = this._draft.title.trim();
    const userWasSelected = userId != null;
    const selectedUser = this._members().find((member) => Number(member.user_id) === Number(userId));
    const configEntryId = this._configEntryId();
    const resolvedFrequencyType = FREQUENCY_VALUES.has(this._draft.frequencyType)
      ? this._draft.frequencyType
      : "once";
    const parsedPriority = Number(this._draft.priority);
    const resolvedPriority = Number.isInteger(parsedPriority) && parsedPriority >= 0 && parsedPriority <= 5
      ? parsedPriority
      : 0;
    if (!cleanTitle) {
      this._formError = "Bitte einen Titel eingeben.";
      this._render();
      return;
    }
    if (userWasSelected && !selectedUser) {
      this._formError = "Die ausgewählte Donetick-Person ist nicht mehr verfügbar.";
      this._render();
      return;
    }
    if (!configEntryId) {
      this._formError = "Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.";
      this._render();
      return;
    }
    const parsedDue = due ? new Date(due) : null;
    if (parsedDue && Number.isNaN(parsedDue.getTime())) {
      this._formError = "Das Fälligkeitsdatum ist ungültig.";
      this._render();
      return;
    }
    this._busyCreate = true;
    this._formError = "";
    this._render();
    try {
      const data = {
        name: cleanTitle,
        description: String(description || "").trim(),
        frequency_type: resolvedFrequencyType,
        assign_strategy: selectedUser ? "keep_last_assigned" : "no_assignee",
        priority: resolvedPriority,
        is_rolling: false,
        config_entry_id: configEntryId,
      };
      if (selectedUser) {
        data.assignee_ids = [Number(selectedUser.user_id)];
        data.assigned_to = Number(selectedUser.user_id);
      }
      // frequency is the repeat interval and only means anything for recurring
      // chores; for "once" Donetick has no use for it.
      if (resolvedFrequencyType !== "once") data.frequency = 1;
      if (parsedDue) data.next_due_date = parsedDue.toISOString();
      await this._hass.callService("donetick", "create_chore", data);
      this._dialogOpen = false;
      this._selectedCreateUserId = null;
      this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
      this._setStatus("Aufgabe wurde hinzugefügt.");
    } catch (error) {
      this._formError = `Aufgabe konnte nicht hinzugefügt werden: ${error?.message || error}`;
      this._notify(this._formError);
    } finally {
      this._busyCreate = false;
      this._render();
    }
  }

  async _complete(taskId, userId, assignedTo = null) {
    if (this._busyTaskIds.has(Number(taskId))) return;
    if (this._completedTasks.has(Number(taskId))) return;
    const configEntryId = this._configEntryId();
    const memberExists = this._members().some((member) => Number(member.user_id) === Number(userId));
    const assignedToId = Number(assignedTo);
    if (!configEntryId) {
      this._setStatus("Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.", { autoDismiss: false });
      this._render();
      return;
    }
    if (!memberExists) {
      this._setStatus("Die ausgewählte Donetick-Person ist nicht mehr verfügbar.", { autoDismiss: false });
      this._render();
      return;
    }
    const task = this._tasks().find((candidate) => Number(candidate.attributes.task_id) === Number(taskId));
    const dueAtCompletion = task?.attributes?.next_due_date ?? null;
    const taskName = task?.state ?? "Aufgabe";
    const member = this._members().find((candidate) => Number(candidate.user_id) === Number(userId));
    this._setStatus("");
    this._busyTaskIds.add(Number(taskId));
    this._render();
    try {
      const data = {
        chore_id: Number(taskId),
        completed_by: Number(userId),
        config_entry_id: configEntryId,
      };
      if (Number.isInteger(assignedToId) && assignedToId > 0) {
        data.assigned_to = assignedToId;
      }
      await this._hass.callService("donetick", "complete_chore", data);
      this._expandedTaskId = null;
      // The coordinator only refreshes the sensor a moment later. Until then,
      // hold the row as done locally - otherwise nothing visibly happens and
      // the user books the chore a second time.
      this._completedTasks.set(Number(taskId), { dueAtCompletion, at: Date.now() });
      this._setStatus(member
        ? `„${taskName}" – erledigt von ${member.display_name}.`
        : `„${taskName}" wurde als erledigt gebucht.`);
    } catch (error) {
      this._setStatus(`Aufgabe konnte nicht abgeschlossen werden: ${error?.message || error}`, { autoDismiss: false });
      this._notify(this._statusMessage);
    } finally {
      this._busyTaskIds.delete(Number(taskId));
      this._render();
    }
  }

  _pruneCompleted(tasks) {
    if (!this._completedTasks.size) return;
    const byId = new Map(tasks.map((task) => [Number(task.attributes.task_id), task]));
    for (const [taskId, entry] of this._completedTasks) {
      const task = byId.get(taskId);
      // Sensor gone (one-off chore) or carrying a new due date (recurring) -
      // either way Donetick has processed the booking.
      const settled =
        !task ||
        (task.attributes.next_due_date ?? null) !== entry.dueAtCompletion ||
        Date.now() - entry.at > 120000;
      if (settled) this._completedTasks.delete(taskId);
    }
  }

  _closeDialog() {
    if (this._busyCreate) return;
    this._dialogOpen = false;
    this._selectedCreateUserId = null;
    this._formError = "";
    this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
    this._render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  //
  // The card is no longer rebuilt from scratch on every update. The shell is
  // created once (_ensureShell); after that only the parts that actually
  // changed get touched. Text goes through textContent rather than string
  // templating, so Donetick data can no longer turn into markup.
  // ---------------------------------------------------------------------------

  _ensureShell() {
    if (this._shell) return;

    const sheet = sharedStyleSheet();
    if (sheet && "adoptedStyleSheets" in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = [sheet];
    } else {
      const style = document.createElement("style");
      style.textContent = STYLES;
      this.shadowRoot.append(style);
    }

    const card = document.createElement("ha-card");

    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("div");
    title.className = "title";
    const count = document.createElement("div");
    count.className = "count";
    const add = document.createElement("button");
    add.className = "add";
    add.type = "button";
    add.title = "Aufgabe hinzufügen";
    add.setAttribute("aria-label", "Aufgabe hinzufügen");
    const addIcon = document.createElement("ha-icon");
    addIcon.setAttribute("icon", "mdi:plus");
    add.append(addIcon);
    header.append(title, count, add);

    const status = document.createElement("div");
    status.className = "status";
    status.hidden = true;
    const statusText = document.createElement("span");
    statusText.className = "status-text";
    // The live region sits on the text, not the container - otherwise a screen
    // reader also announces the "x" of the dismiss button.
    statusText.setAttribute("role", "status");
    const statusClose = document.createElement("button");
    statusClose.className = "status-close";
    statusClose.type = "button";
    statusClose.setAttribute("aria-label", "Meldung schließen");
    statusClose.textContent = "×";
    statusClose.addEventListener("click", () => {
      this._setStatus("");
      this._render();
    });
    status.append(statusText, statusClose);

    const list = document.createElement("div");
    list.className = "list";

    card.append(header, status, list);

    // The dialog deliberately sits outside the ha-card. ha-card carries
    // overflow: hidden, and a position: fixed child gets clipped by that as
    // soon as any ancestor establishes a containing block (transform, filter,
    // contain) - which can happen anywhere in the HA layout.
    const dialogHost = document.createElement("div");
    dialogHost.className = "dialog-host";

    this.shadowRoot.append(card, dialogHost);
    this._shell = { card, title, count, add, status, statusText, list, dialogHost };
    this._rows = new Map();
    this._bindShellEvents();
  }

  // Rows are created and discarded continuously. Per-row listeners would have
  // to be re-attached every time; delegation on the list does not.
  _bindShellEvents() {
    const { add, list } = this._shell;

    add.addEventListener("click", () => this._openDialog());

    list.addEventListener("click", (event) => {
      const check = event.target.closest?.("button.check");
      if (check && !check.disabled) {
        const taskId = Number(check.dataset.taskId);
        this._expandedTaskId = this._expandedTaskId === taskId ? null : taskId;
        this._render();
        return;
      }
      const member = event.target.closest?.("button.member");
      if (member && !member.disabled) {
        const assignedTo = Number(member.dataset.assignedToUserId);
        this._complete(
          Number(member.dataset.taskId),
          Number(member.dataset.userId),
          Number.isInteger(assignedTo) && assignedTo > 0 ? assignedTo : null,
        );
      }
    });
  }

  _openDialog() {
    // So focus can go back where it came from when the dialog closes.
    this._focusBeforeDialog = this.shadowRoot.activeElement || this._shell.add;
    this._dialogOpen = true;
    this._selectedCreateUserId = null;
    this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
    this._setStatus("");
    this._formError = this._members().length
      ? (this._configEntryId() ? "" : "Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.")
      : "Keine Donetick-Benutzer verfügbar. Bitte die Integration neu laden.";
    this._render();
    this._dialog?.title.focus();
  }

  _placeholder(className, text) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  }

  _createRow() {
    const root = document.createElement("div");
    root.className = "task";

    const main = document.createElement("div");
    main.className = "task-main";

    const check = document.createElement("button");
    check.className = "check";
    check.type = "button";

    const text = document.createElement("div");
    text.className = "text";
    const name = document.createElement("div");
    name.className = "name";
    const due = document.createElement("div");
    due.className = "due";
    text.append(name, due);
    main.append(check, text);

    const chooser = document.createElement("div");
    chooser.className = "chooser";
    chooser.setAttribute("role", "group");
    chooser.setAttribute("aria-label", "Erledigt von");
    chooser.hidden = true;
    const chooserLabel = document.createElement("span");
    chooserLabel.className = "chooser-label";
    chooserLabel.textContent = "Erledigt von";
    chooser.append(chooserLabel);

    root.append(main, chooser);
    return { root, check, name, due, chooser, checkKey: null, chooserKey: null };
  }

  _checkContent(busy, done, assignedInitial) {
    if (busy) {
      const spinner = document.createElement("span");
      spinner.className = "spinner";
      return spinner;
    }
    if (done) {
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", "mdi:check-circle");
      return icon;
    }
    if (assignedInitial) {
      const initial = document.createElement("span");
      initial.className = "assignee-initial";
      initial.textContent = assignedInitial;
      return initial;
    }
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:checkbox-blank-circle-outline");
    return icon;
  }

  _updateRow(row, task, taskId, members) {
    const done = this._completedTasks.has(taskId);
    const busy = this._busyTaskIds.has(taskId);
    const expanded = this._expandedTaskId === taskId && !done;
    const due = task.attributes.next_due_date;

    const assignedToId = Number(task.attributes.assigned_to_user_id);
    const assignedTo = Number.isInteger(assignedToId) && assignedToId > 0 ? assignedToId : null;
    const assignedMember = members.find((member) => Number(member.user_id) === assignedToId);
    const assignedInitial = assignedMember ? this._memberInitial(assignedMember, members) : null;

    row.root.classList.toggle("expanded", expanded);
    row.root.classList.toggle("done", done);

    row.name.textContent = task.state;
    row.due.textContent = done ? "Gebucht – warte auf Donetick …" : this._dueText(due);
    row.due.classList.toggle("overdue", !done && this._isOverdue(due));

    row.check.dataset.taskId = String(taskId);
    row.check.disabled = busy || done;
    row.check.title = done ? "Bereits gebucht" : "Erlediger auswählen";
    row.check.setAttribute(
      "aria-label",
      done ? `${task.state} wurde gebucht` : `Erlediger für ${task.state} auswählen`,
    );
    row.check.setAttribute("aria-expanded", String(expanded));

    const checkKey = busy ? "busy" : done ? "done" : assignedInitial ? `initial:${assignedInitial}` : "open";
    if (row.checkKey !== checkKey) {
      row.checkKey = checkKey;
      row.check.replaceChildren(this._checkContent(busy, done, assignedInitial));
    }

    row.chooser.hidden = !expanded;
    if (!expanded) {
      row.chooserKey = null;
      return;
    }

    const chooserKey = `${members.map((member) => `${member.user_id}:${member.display_name}`).join("|")}#${assignedTo}#${busy}`;
    if (row.chooserKey === chooserKey) return;
    row.chooserKey = chooserKey;

    const buttons = members.map((member) => {
      const button = document.createElement("button");
      button.className = "member";
      button.type = "button";
      button.dataset.taskId = String(taskId);
      button.dataset.userId = String(Number(member.user_id));
      button.dataset.assignedToUserId = assignedTo == null ? "" : String(assignedTo);
      button.title = member.display_name;
      button.setAttribute("aria-label", `Erledigt von ${member.display_name}`);
      button.disabled = busy;
      button.textContent = this._memberInitial(member, members);
      return button;
    });
    row.chooser.replaceChildren(row.chooser.firstElementChild, ...buttons);
  }

  _renderRows(tasks, members) {
    const { list } = this._shell;

    if (!tasks.length) {
      this._rows.clear();
      list.replaceChildren(this._placeholder("empty", "Keine offenen Aufgaben"));
      return;
    }

    const seen = new Set();
    const ordered = [];
    for (const task of tasks) {
      const taskId = Number(task.attributes.task_id);
      seen.add(taskId);
      let row = this._rows.get(taskId);
      if (!row) {
        row = this._createRow();
        this._rows.set(taskId, row);
      }
      this._updateRow(row, task, taskId, members);
      ordered.push(row.root);
    }
    for (const taskId of [...this._rows.keys()]) {
      if (!seen.has(taskId)) this._rows.delete(taskId);
    }

    // Only touch this when the set of rows or their order actually changed.
    // Taking a node out of the DOM drops focus, even if it goes straight back
    // in.
    const current = list.childNodes;
    let changed = current.length !== ordered.length;
    if (!changed) {
      for (let index = 0; index < ordered.length; index += 1) {
        if (current[index] !== ordered[index]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) list.replaceChildren(...ordered);
  }

  _createDialog() {
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
    heading.textContent = "Neue Aufgabe";
    const close = document.createElement("button");
    close.className = "dialog-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dialog schließen");
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
    for (const entry of FREQUENCY_TYPES) {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      frequencyType.append(option);
    }

    const priority = document.createElement("select");
    priority.name = "priority";
    for (const value of [0, 1, 2, 3, 4, 5]) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      priority.append(option);
    }

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = "Zuständig";
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
    cancel.textContent = "Abbrechen";
    const save = document.createElement("button");
    save.className = "save";
    save.type = "submit";
    save.textContent = "Speichern";
    actions.append(cancel, save);

    form.append(
      labelled("Titel", title),
      labelled("Beschreibung", description),
      labelled("Fällig am", due),
      labelled("Wiederholung", frequencyType),
      labelled("Priorität", priority),
      fieldset,
      formError,
      actions,
    );
    section.append(header, form);
    backdrop.append(section);

    close.addEventListener("click", () => this._closeDialog());
    cancel.addEventListener("click", () => this._closeDialog());
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) this._closeDialog();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this._closeDialog();
        return;
      }
      if (event.key === "Tab") this._trapFocus(event, section);
    });

    memberBox.addEventListener("click", (event) => {
      const button = event.target.closest?.("button.create-member");
      if (!button) return;
      this._selectedCreateUserId = Number(button.dataset.createUserId);
      for (const candidate of memberBox.querySelectorAll("button.create-member")) {
        const selected = candidate === button;
        candidate.classList.toggle("selected", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      }
      this._formError = "";
      formError.textContent = "";
      formError.hidden = true;
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this._createTask({
        title: title.value,
        description: description.value,
        due: due.value,
        userId: this._selectedCreateUserId,
        frequencyType: frequencyType.value,
        priority: priority.value,
      });
    });

    return {
      backdrop, section, title, description, due, frequencyType, priority,
      memberBox, formError, save, memberKey: null,
    };
  }

  // aria-modal="true" claims the rest of the page is unreachable. Without a
  // focus trap that isn't true: Tab walks on into the dashboard underneath.
  _trapFocus(event, section) {
    const focusable = [...section.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.shadowRoot.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  _updateDialog(members) {
    const dialog = this._dialog;

    const memberKey = members.map((member) => `${member.user_id}:${member.display_name}`).join("|");
    if (dialog.memberKey !== memberKey) {
      dialog.memberKey = memberKey;
      dialog.memberBox.replaceChildren(...members.map((member) => {
        const button = document.createElement("button");
        button.className = "create-member";
        button.type = "button";
        button.dataset.createUserId = String(Number(member.user_id));
        button.title = member.display_name;
        button.setAttribute("aria-label", `${member.display_name} auswählen`);
        button.textContent = this._memberInitial(member, members);
        return button;
      }));
    }
    for (const button of dialog.memberBox.querySelectorAll("button.create-member")) {
      const selected = Number(button.dataset.createUserId) === Number(this._selectedCreateUserId);
      button.classList.toggle("selected", selected);
      // aria-pressed used to appear in the markup only after the first click.
      button.setAttribute("aria-pressed", String(selected));
    }

    dialog.formError.textContent = this._formError;
    dialog.formError.hidden = !this._formError;

    dialog.save.disabled = this._busyCreate;
    dialog.save.textContent = this._busyCreate ? "Speichert …" : "Speichern";
  }

  _renderDialog(members) {
    const { dialogHost } = this._shell;

    if (!this._dialogOpen) {
      if (!this._dialog) return;
      this._dialog = null;
      dialogHost.replaceChildren();
      // Focus back to wherever it was before the dialog opened.
      const target = this._focusBeforeDialog || this._shell.add;
      this._focusBeforeDialog = null;
      target?.focus?.();
      return;
    }

    // The dialog is built when it opens and never while it is open - otherwise
    // every data update would wipe whatever the user has typed.
    if (!this._dialog) {
      this._dialog = this._createDialog();
      dialogHost.replaceChildren(this._dialog.backdrop);
    }
    this._updateDialog(members);
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    this._ensureShell();

    const { title, count, status, statusText, list, add } = this._shell;
    title.textContent = this._config.title;

    if (!this._hass) {
      count.textContent = "";
      // Nothing can be created without hass, and a button that does nothing on
      // click is worse than one that is visibly disabled.
      add.disabled = true;
      this._rows.clear();
      list.replaceChildren(this._placeholder("loading", "Lade Aufgaben …"));
      return;
    }
    add.disabled = false;

    const tasks = this._tasks();
    const members = this._members();
    this._pruneCompleted(tasks);

    count.textContent = `${tasks.length - this._completedTasks.size} offen`;

    statusText.textContent = this._statusMessage;
    status.hidden = !this._statusMessage;

    this._renderRows(tasks, members);
    this._renderDialog(members);
  }
}

if (!customElements.get("donetick-chores-card")) {
  customElements.define("donetick-chores-card", DonetickChoresCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "donetick-chores-card")) {
  window.customCards.push({
    type: "donetick-chores-card",
    name: "Donetick Aufgaben",
    description: "Donetick-Aufgaben mit Auswahl des Erledigers",
    preview: true,
  });
}
