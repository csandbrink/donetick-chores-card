import { STYLES, sharedStyleSheet } from "./styles.js";
import { parseDue, daysFromToday, isBeforeToday, formatDayMonth } from "./dates.js";
import { LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, translate, localeOf } from "./i18n.js";
import { createDialog, FREQUENCY_VALUES } from "./dialog.js";

const EMPTY_DRAFT = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };

export class DonetickChoresCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._language = DEFAULT_LANGUAGE;
    this._expandedTaskId = null;
    this._busyTaskIds = new Set();
    this._dialogOpen = false;
    this._busyCreate = false;
    this._selectedCreateUserId = null;
    // Messages are kept as key + params so a language switch can re-translate
    // whatever is on screen; _formError and _statusMessage hold the text.
    this._formErrorSource = null;
    this._formError = "";
    this._statusSource = null;
    this._statusMessage = "";
    this._draft = { ...EMPTY_DRAFT };
    this._completedTasks = new Map();
    this._dialog = null;
    this._focusBeforeDialog = null;
    this._statusTimer = null;
    this._pruneTimer = null;
  }

  // Without this the timers still fire after the card has been removed from the
  // dashboard - switching views, or editing the dashboard.
  disconnectedCallback() {
    this._clearStatusTimer();
    clearTimeout(this._pruneTimer);
    this._pruneTimer = null;
  }

  _clearStatusTimer() {
    if (!this._statusTimer) return;
    clearTimeout(this._statusTimer);
    this._statusTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Language
  // ---------------------------------------------------------------------------

  _t(key, params) {
    return translate(this._language, key, params);
  }

  _locale() {
    return localeOf(this._language);
  }

  /**
   * Switches the card to another language. Everything already on screen is
   * re-translated: the shell's fixed labels, the rows (rebuilt on the next
   * render), the open dialog (rebuilt with its input preserved) and any status
   * or error message. Returns whether anything changed.
   */
  _setLanguage(language) {
    if (language === this._language) return false;
    this._language = language;
    if (this._statusSource) {
      this._statusMessage = this._t(this._statusSource.key, this._statusSource.params);
    }
    if (this._formErrorSource) {
      this._formError = this._t(this._formErrorSource.key, this._formErrorSource.params);
    }
    if (this._shell) {
      this._applyShellLanguage();
      this._rows.clear();
      if (this._dialog) this._rebuildDialog();
    }
    return true;
  }

  _applyShellLanguage() {
    const { add, statusClose } = this._shell;
    add.title = this._t("card.add");
    add.setAttribute("aria-label", this._t("card.add"));
    statusClose.setAttribute("aria-label", this._t("card.dismiss_status"));
  }

  /**
   * Sets the message above the list. Success messages clear themselves; errors
   * stay until the user dismisses them or the next action replaces them.
   */
  _setStatus(key, params, { autoDismiss = true } = {}) {
    this._clearStatusTimer();
    this._statusSource = key ? { key, params } : null;
    this._statusMessage = key ? this._t(key, params) : "";
    if (!key || !autoDismiss || !this.isConnected) return;
    this._statusTimer = setTimeout(() => {
      this._statusTimer = null;
      this._statusSource = null;
      this._statusMessage = "";
      this._render();
    }, this.constructor.statusTimeoutMs);
  }

  _setFormError(key, params) {
    this._formErrorSource = key ? { key, params } : null;
    this._formError = key ? this._t(key, params) : "";
  }

  // ---------------------------------------------------------------------------
  // Home Assistant interface
  // ---------------------------------------------------------------------------

  setConfig(config) {
    // Errors in the config are reported in the language the config asks for,
    // or failing that in Home Assistant's.
    const requestedLanguage = LANGUAGES.includes(config?.language) ? config.language : undefined;
    const t = (key, params) => translate(resolveLanguage(requestedLanguage, this._hass), key, params);

    if (!config || !config.todo_entity) {
      throw new Error(t("config.todo_entity_required"));
    }
    if (typeof config.todo_entity !== "string" || !config.todo_entity.startsWith("todo.")) {
      throw new Error(t("config.todo_entity_type"));
    }
    if (config.title !== undefined && typeof config.title !== "string") {
      throw new Error(t("config.title_type"));
    }
    if (config.sensor_prefix !== undefined &&
        (typeof config.sensor_prefix !== "string" || !config.sensor_prefix)) {
      throw new Error(t("config.sensor_prefix_type"));
    }
    if (config.language !== undefined && !LANGUAGES.includes(config.language)) {
      throw new Error(t("config.language_invalid", { languages: LANGUAGES.join(", ") }));
    }
    const previous = this._config;
    this._config = {
      sensor_prefix: "sensor.donetick_chores_",
      ...config,
    };
    this._setLanguage(resolveLanguage(this._config.language, this._hass));

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
      this._setStatus(null);
      clearTimeout(this._pruneTimer);
      this._pruneTimer = null;
    }
    this._render();
  }

  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    const languageChanged = this._config
      ? this._setLanguage(resolveLanguage(this._config.language, hass))
      : false;
    if (previous && !languageChanged && !this._relevantChange(previous, hass)) return;
    if (this._dialogOpen) {
      // Rebuilding would wipe what the user has typed, but the member list and
      // the "no users" notice must not go stale while the dialog is open.
      if (this._dialog && this._config) {
        const members = this._members();
        if (members.length && this._formErrorSource?.key === "error.no_users") this._setFormError(null);
        if (!languageChanged) {
          this._updateDialog(members);
          return;
        }
      }
    }
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

  // How long a success message stays up, in milliseconds.
  static statusTimeoutMs = 8000;

  // How long a booking is held as done locally before the sensor must have caught up.
  static completedTimeoutMs = 120000;

  // Masonry layout: height units of roughly 50 px. A header plus one row per
  // chore is far closer to the real height than a constant.
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
    const title = translate(resolveLanguage(undefined, hass), "card.title_default");
    return { todo_entity: donetickTodo || "todo.all_tasks", title };
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  _tasks() {
    if (!this._hass || !this._config) return [];
    const locale = this._locale();
    return Object.values(this._hass.states)
      .filter((state) =>
        state.entity_id?.startsWith(this._config.sensor_prefix) &&
        state.attributes?.task_id != null &&
        state.attributes.is_active !== false
      )
      .sort((a, b) => {
        // Unparsable dates sort like missing ones; NaN would break the
        // comparator contract.
        const dueA = parseDue(a.attributes.next_due_date);
        const dueB = parseDue(b.attributes.next_due_date);
        if (dueA !== null && dueB !== null) return dueA - dueB;
        if (dueA !== null) return -1;
        if (dueB !== null) return 1;
        return String(a.state).localeCompare(String(b.state), locale);
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
    return String(name || "?").trim().charAt(0).toLocaleUpperCase(this._locale());
  }

  _memberInitial(member, members) {
    const name = String(member?.display_name || "?").trim();
    const initial = this._initial(name);
    const collides = members.some((other) =>
      Number(other?.user_id) !== Number(member?.user_id) &&
      this._initial(other?.display_name) === initial
    );
    if (!collides) return initial;
    const locale = this._locale();
    const chars = Array.from(name);
    return `${chars[0]?.toLocaleUpperCase(locale) || "?"}${chars[1]?.toLocaleLowerCase(locale) || ""}`;
  }

  _dueText(value) {
    if (!value) return "";
    const time = parseDue(value);
    if (time === null) return this._t("due.invalid");
    const days = daysFromToday(time);
    if (days < -1) return this._t("due.overdue_days", { days: Math.abs(days) });
    if (days === -1) return this._t("due.overdue_yesterday");
    if (days === 0) return this._t("due.today");
    if (days === 1) return this._t("due.tomorrow");
    return this._t("due.on", { date: formatDayMonth(time, this._locale()) });
  }

  // Same day granularity as _dueText, so a chore labelled "due today" is never
  // shown in the overdue colour.
  _isOverdue(value) {
    const time = parseDue(value);
    if (time === null) return false;
    return isBeforeToday(time);
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

  // ---------------------------------------------------------------------------
  // Service calls
  // ---------------------------------------------------------------------------

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
      this._setFormError("error.title_required");
      this._render();
      return;
    }
    if (userWasSelected && !selectedUser) {
      this._setFormError("error.member_unavailable");
      this._render();
      return;
    }
    if (!configEntryId) {
      this._setFormError("error.config_entry_missing");
      this._render();
      return;
    }
    const parsedDue = due ? new Date(due) : null;
    if (parsedDue && Number.isNaN(parsedDue.getTime())) {
      this._setFormError("error.due_invalid");
      this._render();
      return;
    }
    this._busyCreate = true;
    this._setFormError(null);
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
      this._draft = { ...EMPTY_DRAFT };
      this._setStatus("status.created");
    } catch (error) {
      this._setFormError("error.create_failed", { message: error?.message || error });
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
      this._setStatus("error.config_entry_missing", undefined, { autoDismiss: false });
      this._render();
      return;
    }
    if (!memberExists) {
      this._setStatus("error.member_unavailable", undefined, { autoDismiss: false });
      this._render();
      return;
    }
    const task = this._tasks().find((candidate) => Number(candidate.attributes.task_id) === Number(taskId));
    const sourceKey = `${this._config.todo_entity}|${this._config.sensor_prefix}`;
    const dueAtCompletion = task?.attributes?.next_due_date ?? null;
    const taskName = task?.state ?? this._t("status.task_fallback");
    const member = this._members().find((candidate) => Number(candidate.user_id) === Number(userId));
    this._setStatus(null);
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
      // The card may have been pointed at another source while the call ran.
      if (sourceKey !== `${this._config.todo_entity}|${this._config.sensor_prefix}`) return;
      this._expandedTaskId = null;
      // The coordinator only refreshes the sensor a moment later. Until then,
      // hold the row as done locally - otherwise nothing visibly happens and
      // the user books the chore a second time.
      this._completedTasks.set(Number(taskId), { dueAtCompletion, at: Date.now() });
      // If Donetick stays silent no hass update arrives to prune the entry.
      clearTimeout(this._pruneTimer);
      this._pruneTimer = this.isConnected
        ? setTimeout(() => {
            this._pruneTimer = null;
            this._render();
          }, this.constructor.completedTimeoutMs + 100)
        : null;
      if (member) {
        this._setStatus("status.completed_by", { task: taskName, name: member.display_name });
      } else {
        this._setStatus("status.completed", { task: taskName });
      }
    } catch (error) {
      this._setStatus("error.complete_failed", { message: error?.message || error }, { autoDismiss: false });
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
        Date.now() - entry.at > this.constructor.completedTimeoutMs;
      if (settled) this._completedTasks.delete(taskId);
    }
  }

  _closeDialog() {
    if (this._busyCreate) return;
    this._dialogOpen = false;
    this._selectedCreateUserId = null;
    this._setFormError(null);
    this._draft = { ...EMPTY_DRAFT };
    this._render();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  //
  // The card is not rebuilt from scratch on every update. The shell is created
  // once (_ensureShell); after that only the parts that actually changed get
  // touched. Text goes through textContent rather than string templating, so
  // Donetick data can never turn into markup.
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
    statusClose.textContent = "×";
    statusClose.addEventListener("click", () => {
      this._setStatus(null);
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
    this._shell = { card, title, count, add, status, statusText, statusClose, list, dialogHost };
    this._rows = new Map();
    this._applyShellLanguage();
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
    this._draft = { ...EMPTY_DRAFT };
    this._setStatus(null);
    if (!this._members().length) {
      this._setFormError("error.no_users");
    } else if (!this._configEntryId()) {
      this._setFormError("error.config_entry_missing");
    } else {
      this._setFormError(null);
    }
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
    chooser.setAttribute("aria-label", this._t("row.completed_by"));
    chooser.hidden = true;
    const chooserLabel = document.createElement("span");
    chooserLabel.className = "chooser-label";
    chooserLabel.textContent = this._t("row.completed_by");
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
    row.due.textContent = done ? this._t("row.booked_waiting") : this._dueText(due);
    // A chore without a due date says nothing rather than "no due date".
    row.due.hidden = !row.due.textContent;
    row.due.classList.toggle("overdue", !done && this._isOverdue(due));

    row.check.dataset.taskId = String(taskId);
    row.check.disabled = busy || done;
    row.check.title = done ? this._t("row.already_booked") : this._t("row.pick_completer");
    row.check.setAttribute(
      "aria-label",
      done
        ? this._t("row.was_booked", { task: task.state })
        : this._t("row.pick_completer_for", { task: task.state }),
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
      button.setAttribute("aria-label", this._t("row.completed_by_member", { name: member.display_name }));
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
      list.replaceChildren(this._placeholder("empty", this._t("card.empty")));
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
    return createDialog({
      t: (key, params) => this._t(key, params),
      onClose: () => this._closeDialog(),
      onSelectMember: (userId) => {
        this._selectedCreateUserId = userId;
        this._setFormError(null);
      },
      onSubmit: (values) => this._createTask({ ...values, userId: this._selectedCreateUserId }),
      trapFocus: (event, section) => this._trapFocus(event, section),
    });
  }

  // A language switch while the dialog is open: the labels are baked into the
  // markup, so the dialog is built again - with what the user has typed and
  // picked carried over.
  _rebuildDialog() {
    const old = this._dialog;
    const hadFocus = this.shadowRoot.activeElement && old.section.contains(this.shadowRoot.activeElement);
    const fresh = this._createDialog();
    fresh.title.value = old.title.value;
    fresh.description.value = old.description.value;
    fresh.due.value = old.due.value;
    fresh.frequencyType.value = old.frequencyType.value;
    fresh.priority.value = old.priority.value;
    this._dialog = fresh;
    this._shell.dialogHost.replaceChildren(fresh.backdrop);
    if (hadFocus) fresh.title.focus();
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
        button.setAttribute("aria-label", this._t("dialog.select_member", { name: member.display_name }));
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
    dialog.save.textContent = this._busyCreate ? this._t("dialog.saving") : this._t("dialog.save");
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
    title.textContent = this._config.title ?? this._t("card.title_default");

    if (!this._hass) {
      count.textContent = "";
      // Nothing can be created without hass, and a button that does nothing on
      // click is worse than one that is visibly disabled.
      add.disabled = true;
      this._rows.clear();
      list.replaceChildren(this._placeholder("loading", this._t("card.loading")));
      return;
    }
    add.disabled = false;

    const tasks = this._tasks();
    const members = this._members();
    this._pruneCompleted(tasks);

    count.textContent = this._t("card.open_count", { count: tasks.length - this._completedTasks.size });

    statusText.textContent = this._statusMessage;
    status.hidden = !this._statusMessage;

    this._renderRows(tasks, members);
    this._renderDialog(members);
  }
}
