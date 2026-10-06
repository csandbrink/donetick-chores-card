import { STYLES, sharedStyleSheet } from "./styles.js";
import { parseDue, daysFromToday, isBeforeToday, formatDayMonth, toDateTimeLocal, defaultTimeOfDay } from "./dates.js";
import { LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, translate, localeOf } from "./i18n.js";
import {
  createDialog, FREQUENCY_VALUES, INTERVAL_UNIT_VALUES, WEEKDAY_VALUES,
} from "./dialog.js";

const EMPTY_DRAFT = {
  title: "", description: "", due: "", frequencyType: "once",
  interval: "1", intervalUnit: "days", weekdays: [], priority: "0",
};

export const GROUP_BY_VALUES = ["none", "due"];

// Order of the due-date groups on screen. Empty groups are not rendered.
const DUE_GROUPS = ["overdue", "today", "week", "later", "none"];

// The person filter: null shows everything, a number is a member's user_id,
// UNASSIGNED shows chores nobody is assigned to.
const UNASSIGNED = "unassigned";

export class DonetickChoresCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._language = DEFAULT_LANGUAGE;
    this._expandedTaskId = null;
    this._busyTaskIds = new Set();
    this._busyDeleteIds = new Set();
    this._confirmDeleteTaskId = null;
    this._dialogOpen = false;
    this._editTaskId = null;
    this._busyCreate = false;
    this._selectedCreateUserId = null;
    this._filter = null;
    this._showAll = false;
    // Messages are kept as key + params so a language switch can re-translate
    // whatever is on screen; _formError and _statusMessage hold the text.
    this._formErrorSource = null;
    this._formError = "";
    this._statusSource = null;
    this._statusMessage = "";
    this._draft = { ...EMPTY_DRAFT };
    this._completedTasks = new Map();
    this._deletedTasks = new Map();
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
      this._filterKey = null;
      if (this._dialog) this._rebuildDialog();
    }
    return true;
  }

  _applyShellLanguage() {
    const { add, statusClose, filters } = this._shell;
    add.title = this._t("card.add");
    add.setAttribute("aria-label", this._t("card.add"));
    statusClose.setAttribute("aria-label", this._t("card.dismiss_status"));
    filters.setAttribute("aria-label", this._t("filter.label"));
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
    if (config.show_filters !== undefined && typeof config.show_filters !== "boolean") {
      throw new Error(t("config.show_filters_type"));
    }
    if (config.group_by !== undefined && !GROUP_BY_VALUES.includes(config.group_by)) {
      throw new Error(t("config.group_by_invalid", { values: GROUP_BY_VALUES.join(", ") }));
    }
    if (config.compact !== undefined && typeof config.compact !== "boolean") {
      throw new Error(t("config.compact_type"));
    }
    if (config.max_items !== undefined &&
        (!Number.isInteger(config.max_items) || config.max_items < 1)) {
      throw new Error(t("config.max_items_type"));
    }
    const previous = this._config;
    this._config = {
      sensor_prefix: "sensor.donetick_chores_",
      show_filters: false,
      group_by: "none",
      compact: false,
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
      this._confirmDeleteTaskId = null;
      this._completedTasks.clear();
      this._deletedTasks.clear();
      this._busyTaskIds.clear();
      this._busyDeleteIds.clear();
      this._filter = null;
      this._showAll = false;
      this._setStatus(null);
      clearTimeout(this._pruneTimer);
      this._pruneTimer = null;
    }
    if (!this._config.show_filters) this._filter = null;
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

  // How long a booking (or deletion) is held locally before the sensor must
  // have caught up.
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

  // The visual editor, registered in index.js.
  static getConfigElement() {
    return document.createElement("donetick-chores-card-editor");
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

  _taskById(taskId) {
    return this._tasks().find((candidate) => Number(candidate.attributes.task_id) === Number(taskId));
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

  _sourceKey() {
    return `${this._config.todo_entity}|${this._config.sensor_prefix}`;
  }

  _assignedTo(task) {
    const id = Number(task.attributes.assigned_to_user_id);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  // Applies the person filter. A filter pointing at a member who has left the
  // circle is dropped rather than leaving an empty list behind.
  _filteredTasks(tasks, members) {
    if (!this._config.show_filters || this._filter === null) return tasks;
    if (this._filter === UNASSIGNED) return tasks.filter((task) => this._assignedTo(task) === null);
    if (!members.some((member) => Number(member.user_id) === this._filter)) {
      this._filter = null;
      return tasks;
    }
    return tasks.filter((task) => this._assignedTo(task) === this._filter);
  }

  _dueGroup(value) {
    const time = parseDue(value);
    if (time === null) return "none";
    const days = daysFromToday(time);
    if (days < 0) return "overdue";
    if (days === 0) return "today";
    if (days < 7) return "week";
    return "later";
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

  _failForm(key, params) {
    this._setFormError(key, params);
    this._render();
  }

  /**
   * Builds frequency, frequency_type and frequency_metadata for create_chore
   * from the dialog values, or returns { error } with a form-error key.
   * Donetick's validator wants metadata.unit for "interval" and a non-empty
   * metadata.days for "days_of_the_week"; its scheduler reads metadata.time
   * (RFC 3339) as the time of day for both.
   */
  _recurrence(draft, parsedDue) {
    const type = FREQUENCY_VALUES.has(draft.frequencyType) ? draft.frequencyType : "once";
    if (type === "once") return { frequency_type: "once" };
    if (type !== "interval" && type !== "days_of_the_week") {
      // frequency is the repeat interval; 1 keeps the previous behaviour.
      return { frequency_type: type, frequency: 1 };
    }
    const metadata = { time: (parsedDue || defaultTimeOfDay()).toISOString() };
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone) metadata.timezone = timezone;
    } catch {
      // No timezone information: Donetick falls back to UTC.
    }
    if (type === "interval") {
      const interval = Number(draft.interval);
      if (!Number.isInteger(interval) || interval < 1) return { error: "error.interval_invalid" };
      metadata.unit = INTERVAL_UNIT_VALUES.has(draft.intervalUnit) ? draft.intervalUnit : "days";
      return { frequency_type: "interval", frequency: interval, frequency_metadata: metadata };
    }
    const days = (Array.isArray(draft.weekdays) ? draft.weekdays : []).filter((day) => WEEKDAY_VALUES.has(day));
    if (!days.length) return { error: "error.weekdays_required" };
    metadata.days = days;
    metadata.weekPattern = "every_week";
    return { frequency_type: "days_of_the_week", frequency: 1, frequency_metadata: metadata };
  }

  _rememberDraft(values) {
    this._draft = {
      title: String(values.title || ""),
      description: String(values.description || ""),
      due: String(values.due || ""),
      frequencyType: String(values.frequencyType || "once"),
      interval: String(values.interval ?? "1"),
      intervalUnit: String(values.intervalUnit || "days"),
      weekdays: Array.isArray(values.weekdays) ? [...values.weekdays] : [],
      priority: String(values.priority ?? 0),
    };
  }

  async _createTask(values) {
    if (this._busyCreate) return;
    const { userId, due } = values;
    this._rememberDraft(values);
    const cleanTitle = this._draft.title.trim();
    const userWasSelected = userId != null;
    const selectedUser = this._members().find((member) => Number(member.user_id) === Number(userId));
    const configEntryId = this._configEntryId();
    const parsedPriority = Number(this._draft.priority);
    const resolvedPriority = Number.isInteger(parsedPriority) && parsedPriority >= 0 && parsedPriority <= 5
      ? parsedPriority
      : 0;
    if (!cleanTitle) return this._failForm("error.title_required");
    if (userWasSelected && !selectedUser) return this._failForm("error.member_unavailable");
    if (!configEntryId) return this._failForm("error.config_entry_missing");
    const parsedDue = due ? new Date(due) : null;
    if (parsedDue && Number.isNaN(parsedDue.getTime())) return this._failForm("error.due_invalid");
    const recurrence = this._recurrence(this._draft, parsedDue);
    if (recurrence.error) return this._failForm(recurrence.error);

    this._busyCreate = true;
    this._setFormError(null);
    this._render();
    try {
      const data = {
        name: cleanTitle,
        description: this._draft.description.trim(),
        ...recurrence,
        assign_strategy: selectedUser ? "keep_last_assigned" : "no_assignee",
        priority: resolvedPriority,
        is_rolling: false,
        config_entry_id: configEntryId,
      };
      if (selectedUser) {
        data.assignee_ids = [Number(selectedUser.user_id)];
        data.assigned_to = Number(selectedUser.user_id);
      }
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

  // donetick.update_task takes name, description and due_date - nothing else,
  // which is why the edit dialog shows only those three fields.
  async _updateTask(values) {
    if (this._busyCreate) return;
    const taskId = Number(this._editTaskId);
    this._rememberDraft(values);
    const cleanTitle = this._draft.title.trim();
    const configEntryId = this._configEntryId();
    const task = this._taskById(taskId);
    if (!cleanTitle) return this._failForm("error.title_required");
    if (!configEntryId) return this._failForm("error.config_entry_missing");
    if (!task) return this._failForm("error.task_gone");
    const parsedDue = this._draft.due ? new Date(this._draft.due) : null;
    if (parsedDue && Number.isNaN(parsedDue.getTime())) return this._failForm("error.due_invalid");

    const sourceKey = this._sourceKey();
    this._busyCreate = true;
    this._setFormError(null);
    this._render();
    try {
      const data = {
        task_id: taskId,
        name: cleanTitle,
        description: this._draft.description.trim(),
        config_entry_id: configEntryId,
      };
      if (parsedDue) data.due_date = parsedDue.toISOString();
      await this._hass.callService("donetick", "update_task", data);
      if (sourceKey !== this._sourceKey()) return;
      this._dialogOpen = false;
      this._editTaskId = null;
      this._draft = { ...EMPTY_DRAFT };
      this._setStatus("status.updated", { task: cleanTitle });
    } catch (error) {
      this._setFormError("error.update_failed", { message: error?.message || error });
      this._notify(this._formError);
    } finally {
      this._busyCreate = false;
      this._render();
    }
  }

  async _delete(taskId) {
    taskId = Number(taskId);
    if (this._busyDeleteIds.has(taskId) || this._busyTaskIds.has(taskId)) return;
    if (this._deletedTasks.has(taskId) || this._completedTasks.has(taskId)) return;
    const configEntryId = this._configEntryId();
    this._confirmDeleteTaskId = null;
    if (!configEntryId) {
      this._setStatus("error.config_entry_missing", undefined, { autoDismiss: false });
      this._render();
      return;
    }
    const task = this._taskById(taskId);
    const taskName = task?.state ?? this._t("status.task_fallback");
    const sourceKey = this._sourceKey();
    this._setStatus(null);
    this._busyDeleteIds.add(taskId);
    this._render();
    try {
      await this._hass.callService("donetick", "delete_task", {
        task_id: taskId,
        config_entry_id: configEntryId,
      });
      if (sourceKey !== this._sourceKey()) return;
      if (this._expandedTaskId === taskId) this._expandedTaskId = null;
      // The sensor only disappears after the coordinator's next refresh; hold
      // the row as gone until then so nobody deletes it a second time.
      this._deletedTasks.set(taskId, { at: Date.now() });
      this._armPruneTimer();
      this._setStatus("status.deleted", { task: taskName });
    } catch (error) {
      this._setStatus("error.delete_failed", { message: error?.message || error }, { autoDismiss: false });
      this._notify(this._statusMessage);
    } finally {
      this._busyDeleteIds.delete(taskId);
      this._render();
    }
  }

  async _complete(taskId, userId, assignedTo = null) {
    if (this._busyTaskIds.has(Number(taskId))) return;
    if (this._completedTasks.has(Number(taskId))) return;
    if (this._deletedTasks.has(Number(taskId))) return;
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
    const task = this._taskById(taskId);
    const sourceKey = this._sourceKey();
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
      if (sourceKey !== this._sourceKey()) return;
      this._expandedTaskId = null;
      // The coordinator only refreshes the sensor a moment later. Until then,
      // hold the row as done locally - otherwise nothing visibly happens and
      // the user books the chore a second time.
      this._completedTasks.set(Number(taskId), { dueAtCompletion, at: Date.now() });
      this._armPruneTimer();
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

  // If Donetick stays silent no hass update arrives to prune the entry.
  _armPruneTimer() {
    clearTimeout(this._pruneTimer);
    this._pruneTimer = this.isConnected
      ? setTimeout(() => {
          this._pruneTimer = null;
          this._render();
        }, this.constructor.completedTimeoutMs + 100)
      : null;
  }

  _pruneCompleted(tasks) {
    if (!this._completedTasks.size && !this._deletedTasks.size) return;
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
    for (const [taskId, entry] of this._deletedTasks) {
      if (!byId.has(taskId) || Date.now() - entry.at > this.constructor.completedTimeoutMs) {
        this._deletedTasks.delete(taskId);
      }
    }
  }

  _closeDialog() {
    if (this._busyCreate) return;
    this._dialogOpen = false;
    this._editTaskId = null;
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

    const filters = document.createElement("div");
    filters.className = "filters";
    filters.setAttribute("role", "group");
    filters.hidden = true;

    const list = document.createElement("div");
    list.className = "list";

    const more = document.createElement("button");
    more.className = "more";
    more.type = "button";
    more.hidden = true;

    card.append(header, status, filters, list, more);

    // The dialog deliberately sits outside the ha-card. ha-card carries
    // overflow: hidden, and a position: fixed child gets clipped by that as
    // soon as any ancestor establishes a containing block (transform, filter,
    // contain) - which can happen anywhere in the HA layout.
    const dialogHost = document.createElement("div");
    dialogHost.className = "dialog-host";

    this.shadowRoot.append(card, dialogHost);
    this._shell = { card, title, count, add, status, statusText, statusClose, filters, list, more, dialogHost };
    this._rows = new Map();
    this._groups = new Map();
    this._filterKey = null;
    this._applyShellLanguage();
    this._bindShellEvents();
  }

  // Rows are created and discarded continuously. Per-row listeners would have
  // to be re-attached every time; delegation on the list does not.
  _bindShellEvents() {
    const { add, list, filters, more } = this._shell;

    add.addEventListener("click", () => this._openDialog());

    more.addEventListener("click", () => {
      this._showAll = !this._showAll;
      this._render();
    });

    filters.addEventListener("click", (event) => {
      const chip = event.target.closest?.("button.filter");
      if (!chip) return;
      const value = chip.dataset.filter;
      this._filter = value === "all" ? null : value === UNASSIGNED ? UNASSIGNED : Number(value);
      this._showAll = false;
      this._render();
    });

    list.addEventListener("click", (event) => {
      const check = event.target.closest?.("button.check");
      if (check && !check.disabled) {
        const taskId = Number(check.dataset.taskId);
        this._expandedTaskId = this._expandedTaskId === taskId ? null : taskId;
        this._confirmDeleteTaskId = null;
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
        return;
      }
      const action = event.target.closest?.("button.row-action");
      if (!action || action.disabled) return;
      const taskId = Number(action.dataset.taskId);
      switch (action.dataset.action) {
        case "edit":
          this._openEditDialog(taskId);
          break;
        case "delete":
          // First tap asks, second tap deletes - a wall tablet gets touched by
          // accident often enough.
          this._confirmDeleteTaskId = taskId;
          this._render();
          break;
        case "delete-confirm":
          this._delete(taskId);
          break;
        case "delete-cancel":
          this._confirmDeleteTaskId = null;
          this._render();
          break;
        default:
          break;
      }
    });
  }

  _openDialog() {
    // So focus can go back where it came from when the dialog closes.
    this._focusBeforeDialog = this.shadowRoot.activeElement || this._shell.add;
    this._dialogOpen = true;
    this._editTaskId = null;
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

  _openEditDialog(taskId) {
    const task = this._taskById(taskId);
    if (!task) return;
    this._focusBeforeDialog = this.shadowRoot.activeElement || this._shell.add;
    this._dialogOpen = true;
    this._editTaskId = Number(taskId);
    this._confirmDeleteTaskId = null;
    this._selectedCreateUserId = null;
    this._draft = {
      ...EMPTY_DRAFT,
      title: String(task.state ?? ""),
      description: String(task.attributes.description ?? ""),
      due: toDateTimeLocal(task.attributes.next_due_date),
    };
    this._setStatus(null);
    this._setFormError(this._configEntryId() ? null : "error.config_entry_missing");
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

    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.hidden = true;

    root.append(main, chooser, actions);
    return { root, check, name, due, chooser, actions, checkKey: null, chooserKey: null, actionsKey: null };
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

  _actionButton(action, taskId, label, ariaLabel, className = "") {
    const button = document.createElement("button");
    button.className = `row-action ${className}`.trim();
    button.type = "button";
    button.dataset.action = action;
    button.dataset.taskId = String(taskId);
    button.textContent = label;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  _updateRow(row, task, taskId, members) {
    const deleted = this._deletedTasks.has(taskId);
    const done = this._completedTasks.has(taskId) || deleted;
    const busy = this._busyTaskIds.has(taskId);
    const deleting = this._busyDeleteIds.has(taskId);
    const expanded = this._expandedTaskId === taskId && !done;
    const due = task.attributes.next_due_date;

    const assignedTo = this._assignedTo(task);
    const assignedMember = members.find((member) => Number(member.user_id) === assignedTo);
    const assignedInitial = assignedMember ? this._memberInitial(assignedMember, members) : null;

    row.root.classList.toggle("expanded", expanded);
    row.root.classList.toggle("done", done);
    row.root.classList.toggle("deleted", deleted);

    row.name.textContent = task.state;
    row.due.textContent = deleted
      ? this._t("row.deleted_waiting")
      : done
        ? this._t("row.booked_waiting")
        : deleting
          ? this._t("row.deleting")
          : this._dueText(due);
    // A chore without a due date says nothing rather than "no due date".
    row.due.hidden = !row.due.textContent;
    row.due.classList.toggle("overdue", !done && !deleting && this._isOverdue(due));

    row.check.dataset.taskId = String(taskId);
    row.check.disabled = busy || done || deleting;
    row.check.title = done ? this._t("row.already_booked") : this._t("row.pick_completer");
    row.check.setAttribute(
      "aria-label",
      deleted
        ? this._t("row.was_deleted", { task: task.state })
        : done
          ? this._t("row.was_booked", { task: task.state })
          : this._t("row.pick_completer_for", { task: task.state }),
    );
    row.check.setAttribute("aria-expanded", String(expanded));

    const checkKey = busy || deleting ? "busy" : done ? "done" : assignedInitial ? `initial:${assignedInitial}` : "open";
    if (row.checkKey !== checkKey) {
      row.checkKey = checkKey;
      row.check.replaceChildren(this._checkContent(busy || deleting, done, assignedInitial));
    }

    row.chooser.hidden = !expanded;
    row.actions.hidden = !expanded;
    if (!expanded) {
      row.chooserKey = null;
      row.actionsKey = null;
      return;
    }

    const chooserKey = `${members.map((member) => `${member.user_id}:${member.display_name}`).join("|")}#${assignedTo}#${busy || deleting}`;
    if (row.chooserKey !== chooserKey) {
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
        button.disabled = busy || deleting;
        button.textContent = this._memberInitial(member, members);
        return button;
      });
      row.chooser.replaceChildren(row.chooser.firstElementChild, ...buttons);
    }

    const confirming = this._confirmDeleteTaskId === taskId;
    const actionsKey = `${confirming}#${busy || deleting}#${task.state}`;
    if (row.actionsKey === actionsKey) return;
    row.actionsKey = actionsKey;
    const disabled = busy || deleting;
    if (confirming) {
      const question = document.createElement("span");
      question.className = "confirm-text";
      question.setAttribute("role", "alert");
      question.textContent = this._t("row.delete_confirm");
      const yes = this._actionButton("delete-confirm", taskId, this._t("row.delete_confirm_yes"),
        this._t("row.delete_task", { task: task.state }), "danger");
      const no = this._actionButton("delete-cancel", taskId, this._t("row.delete_confirm_no"));
      yes.disabled = disabled;
      no.disabled = disabled;
      row.actions.replaceChildren(question, yes, no);
    } else {
      const edit = this._actionButton("edit", taskId, this._t("row.edit"),
        this._t("row.edit_task", { task: task.state }));
      const remove = this._actionButton("delete", taskId, this._t("row.delete"),
        this._t("row.delete_task", { task: task.state }));
      edit.disabled = disabled;
      remove.disabled = disabled;
      row.actions.replaceChildren(edit, remove);
    }
  }

  // Only touch the container when the set of nodes or their order actually
  // changed. Taking a node out of the DOM drops focus, even if it goes straight
  // back in.
  _syncChildren(container, ordered) {
    const current = container.childNodes;
    let changed = current.length !== ordered.length;
    if (!changed) {
      for (let index = 0; index < ordered.length; index += 1) {
        if (current[index] !== ordered[index]) {
          changed = true;
          break;
        }
      }
    }
    if (changed) container.replaceChildren(...ordered);
  }

  _renderRows(tasks, members) {
    const { list } = this._shell;

    if (!tasks.length) {
      this._rows.clear();
      this._groups.clear();
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
      ordered.push({ node: row.root, group: this._dueGroup(task.attributes.next_due_date) });
    }
    for (const taskId of [...this._rows.keys()]) {
      if (!seen.has(taskId)) this._rows.delete(taskId);
    }

    if (this._config.group_by !== "due") {
      this._groups.clear();
      this._syncChildren(list, ordered.map((entry) => entry.node));
      return;
    }

    const containers = [];
    for (const key of DUE_GROUPS) {
      const nodes = ordered.filter((entry) => entry.group === key).map((entry) => entry.node);
      if (!nodes.length) {
        this._groups.delete(key);
        continue;
      }
      let group = this._groups.get(key);
      if (!group) {
        const root = document.createElement("section");
        root.className = `group group-${key}`;
        const header = document.createElement("div");
        header.className = "group-header";
        header.setAttribute("role", "heading");
        header.setAttribute("aria-level", "3");
        const rows = document.createElement("div");
        rows.className = "group-rows";
        root.append(header, rows);
        group = { root, header, rows };
        this._groups.set(key, group);
      }
      group.header.textContent = this._t("group.count", { label: this._t(`group.${key}`), count: nodes.length });
      this._syncChildren(group.rows, nodes);
      containers.push(group.root);
    }
    this._syncChildren(list, containers);
  }

  _renderFilters(members) {
    const { filters } = this._shell;
    if (!this._config.show_filters) {
      filters.hidden = true;
      this._filterKey = null;
      return;
    }
    filters.hidden = false;
    const key = `${this._language}|${members.map((member) => `${member.user_id}:${member.display_name}`).join("|")}`;
    if (this._filterKey !== key) {
      this._filterKey = key;
      const chip = (value, label) => {
        const button = document.createElement("button");
        button.className = "filter";
        button.type = "button";
        button.dataset.filter = value;
        button.textContent = label;
        return button;
      };
      filters.replaceChildren(
        chip("all", this._t("filter.all")),
        ...members.map((member) => chip(String(Number(member.user_id)), member.display_name)),
        chip(UNASSIGNED, this._t("filter.unassigned")),
      );
    }
    const active = this._filter === null ? "all" : String(this._filter);
    for (const button of filters.querySelectorAll("button.filter")) {
      const pressed = button.dataset.filter === active;
      button.classList.toggle("selected", pressed);
      button.setAttribute("aria-pressed", String(pressed));
    }
  }

  _createDialog() {
    return createDialog({
      t: (key, params) => this._t(key, params),
      mode: this._editTaskId === null ? "create" : "edit",
      onClose: () => this._closeDialog(),
      onSelectMember: (userId) => {
        this._selectedCreateUserId = userId;
        this._setFormError(null);
      },
      onSubmit: (values) =>
        this._editTaskId === null
          ? this._createTask({ ...values, userId: this._selectedCreateUserId })
          : this._updateTask(values),
      trapFocus: (event, section) => this._trapFocus(event, section),
    });
  }

  _fillDialog(dialog, draft) {
    dialog.title.value = draft.title;
    dialog.description.value = draft.description;
    dialog.due.value = draft.due;
    dialog.frequencyType.value = draft.frequencyType;
    dialog.interval.value = draft.interval;
    dialog.intervalUnit.value = draft.intervalUnit;
    dialog.setWeekdays(draft.weekdays);
    dialog.priority.value = draft.priority;
    dialog.syncFrequencyFields();
  }

  // A language switch while the dialog is open: the labels are baked into the
  // markup, so the dialog is built again - with what the user has typed and
  // picked carried over.
  _rebuildDialog() {
    const old = this._dialog;
    const hadFocus = this.shadowRoot.activeElement && old.section.contains(this.shadowRoot.activeElement);
    const fresh = this._createDialog();
    this._fillDialog(fresh, {
      title: old.title.value,
      description: old.description.value,
      due: old.due.value,
      frequencyType: old.frequencyType.value,
      interval: old.interval.value,
      intervalUnit: old.intervalUnit.value,
      weekdays: old.selectedWeekdays(),
      priority: old.priority.value,
    });
    this._dialog = fresh;
    this._shell.dialogHost.replaceChildren(fresh.backdrop);
    if (hadFocus) fresh.title.focus();
  }

  // aria-modal="true" claims the rest of the page is unreachable. Without a
  // focus trap that isn't true: Tab walks on into the dashboard underneath.
  _trapFocus(event, section) {
    const focusable = [...section.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    )].filter((element) => !element.closest("[hidden]"));
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
      // The edit dialog opens with the chore's current values in it.
      if (this._editTaskId !== null) this._fillDialog(this._dialog, this._draft);
      dialogHost.replaceChildren(this._dialog.backdrop);
    }
    this._updateDialog(members);
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    this._ensureShell();

    const { card, title, count, status, statusText, list, add, more } = this._shell;
    title.textContent = this._config.title ?? this._t("card.title_default");
    card.classList.toggle("compact", this._config.compact === true);

    if (!this._hass) {
      count.textContent = "";
      // Nothing can be created without hass, and a button that does nothing on
      // click is worse than one that is visibly disabled.
      add.disabled = true;
      this._rows.clear();
      this._groups.clear();
      this._shell.filters.hidden = true;
      more.hidden = true;
      list.replaceChildren(this._placeholder("loading", this._t("card.loading")));
      return;
    }
    add.disabled = false;

    const tasks = this._tasks();
    const members = this._members();
    this._pruneCompleted(tasks);
    // Filtering first: it may drop a filter on a member who has left, and the
    // chips must show that.
    const filtered = this._filteredTasks(tasks, members);
    this._renderFilters(members);

    // The counter follows the filter: it names what the list shows.
    const pending = filtered.filter((task) => {
      const taskId = Number(task.attributes.task_id);
      return this._completedTasks.has(taskId) || this._deletedTasks.has(taskId);
    }).length;
    count.textContent = this._t("card.open_count", { count: filtered.length - pending });

    statusText.textContent = this._statusMessage;
    status.hidden = !this._statusMessage;

    const limit = this._config.max_items;
    const truncated = limit !== undefined && filtered.length > limit;
    const visible = truncated && !this._showAll ? filtered.slice(0, limit) : filtered;
    more.hidden = !truncated;
    if (truncated) {
      more.textContent = this._showAll
        ? this._t("card.show_less")
        : this._t("card.show_more", { count: filtered.length - limit });
      more.setAttribute("aria-expanded", String(this._showAll));
    }

    this._renderRows(visible, members);
    this._renderDialog(members);
  }
}
