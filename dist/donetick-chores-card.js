class DonetickChoresCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._expandedTaskId = null;
    this._busyTaskId = null;
    this._dialogOpen = false;
    this._busyCreate = false;
    this._selectedCreateUserId = null;
    this._formError = "";
    this._statusMessage = "";
    this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
    this._lastDataSignature = null;
    this._renderPending = false;
  }

  setConfig(config) {
    if (!config || !config.todo_entity) {
      throw new Error("todo_entity ist erforderlich");
    }
    this._config = {
      title: "Aufgaben",
      sensor_prefix: "sensor.donetick_chores_",
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    const signature = this._dataSignature(hass);
    const relevantChange = signature !== this._lastDataSignature;
    this._hass = hass;
    if (!relevantChange) return;
    this._lastDataSignature = signature;
    if (this._dialogOpen) {
      this._renderPending = true;
      return;
    }
    this._renderPending = false;
    this._render();
  }

  _dataSignature(hass) {
    if (!hass || !this._config) return "";
    const todo = hass.states?.[this._config.todo_entity];
    const members = Array.isArray(todo?.attributes?.circle_members)
      ? todo.attributes.circle_members.map((member) => [Number(member.user_id), member.display_name])
      : [];
    const tasks = Object.values(hass.states || {})
      .filter((state) => state.entity_id?.startsWith(this._config.sensor_prefix))
      .map((state) => [
        state.entity_id,
        state.state,
        state.attributes?.task_id,
        state.attributes?.assigned_to_user_id,
        state.attributes?.is_active,
        state.attributes?.next_due_date,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return JSON.stringify({
      configEntryId: todo?.attributes?.config_entry_id,
      members,
      tasks,
    });
  }

  getCardSize() {
    return 4;
  }

  static getStubConfig() {
    return { todo_entity: "todo.all_tasks", title: "Aufgaben" };
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

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    if (Number.isNaN(due.getTime())) return "";
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

  _isOverdue(value) {
    return Boolean(value) && new Date(value).getTime() < Date.now();
  }

  _dialogHtml(members) {
    if (!this._dialogOpen) return "";
    return `
      <div class="dialog-backdrop" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title">
          <div class="dialog-header">
            <h2 id="new-task-title">Neue Aufgabe</h2>
            <button class="dialog-close" type="button" aria-label="Dialog schließen">×</button>
          </div>
          <form class="create-form">
            <label>Titel<input name="title" type="text" maxlength="255" required autofocus value="${this._escape(this._draft.title)}"></label>
            <label>Beschreibung<textarea name="description" rows="3">${this._escape(this._draft.description)}</textarea></label>
            <label>Fällig am<input name="due" type="datetime-local" value="${this._escape(this._draft.due)}"></label>
            <label>Wiederholung
              <select name="frequencyType">
                <option value="once" ${this._draft.frequencyType === "once" ? "selected" : ""}>Einmalig</option>
                <option value="daily" ${this._draft.frequencyType === "daily" ? "selected" : ""}>Täglich</option>
                <option value="weekly" ${this._draft.frequencyType === "weekly" ? "selected" : ""}>Wöchentlich</option>
              </select>
            </label>
            <label>Priorität
              <select name="priority">
                ${[0, 1, 2, 3, 4, 5].map((priority) => `<option value="${priority}" ${Number(this._draft.priority) === priority ? "selected" : ""}>${priority}</option>`).join("")}
              </select>
            </label>
            <fieldset>
              <legend>Zuständig</legend>
              <div class="create-members">
                ${members.map((member) => `
                  <button class="create-member${Number(member.user_id) === Number(this._selectedCreateUserId) ? " selected" : ""}"
                    type="button" data-create-user-id="${Number(member.user_id)}"
                    title="${this._escape(member.display_name)}" aria-label="${this._escape(member.display_name)} auswählen">
                    ${this._escape(this._memberInitial(member, members))}
                  </button>`).join("")}
              </div>
            </fieldset>
            ${this._formError ? `<div class="form-error" role="alert">${this._escape(this._formError)}</div>` : ""}
            <div class="dialog-actions">
              <button class="cancel" type="button">Abbrechen</button>
              <button class="save" type="submit" ${this._busyCreate ? "disabled" : ""}>
                ${this._busyCreate ? "Speichert …" : "Speichern"}
              </button>
            </div>
          </form>
        </section>
      </div>`;
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
    const validFrequencyTypes = new Set(["once", "daily", "weekly"]);
    const resolvedFrequencyType = validFrequencyTypes.has(this._draft.frequencyType)
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
        frequency: 1,
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
      this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
      this._statusMessage = "Aufgabe wurde hinzugefügt.";
    } catch (error) {
      this._formError = `Aufgabe konnte nicht hinzugefügt werden: ${error?.message || error}`;
    } finally {
      this._busyCreate = false;
      this._render();
    }
  }

  async _complete(taskId, userId, assignedTo = null) {
    if (this._busyTaskId != null) return;
    const configEntryId = this._configEntryId();
    const memberExists = this._members().some((member) => Number(member.user_id) === Number(userId));
    const assignedToId = Number(assignedTo);
    if (!configEntryId) {
      this._statusMessage = "Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.";
      this._render();
      return;
    }
    if (!memberExists) {
      this._statusMessage = "Die ausgewählte Donetick-Person ist nicht mehr verfügbar.";
      this._render();
      return;
    }
    this._statusMessage = "";
    this._busyTaskId = taskId;
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
    } catch (error) {
      this._statusMessage = `Aufgabe konnte nicht abgeschlossen werden: ${error?.message || error}`;
      const event = new Event("hass-notification", { bubbles: true, composed: true });
      event.detail = { message: this._statusMessage };
      this.dispatchEvent(event);
    } finally {
      this._busyTaskId = null;
      this._render();
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

  _bindEvents() {
    this.shadowRoot.querySelector(".add")?.addEventListener("click", () => {
      this._dialogOpen = true;
      this._selectedCreateUserId = null;
      this._draft = { title: "", description: "", due: "", frequencyType: "once", priority: "0" };
      this._statusMessage = "";
      this._formError = this._members().length
        ? (this._configEntryId() ? "" : "Die Donetick-Konfigurations-ID fehlt. Bitte die Integration neu laden.")
        : "Keine Donetick-Benutzer verfügbar. Bitte die Integration neu laden.";
      this._render();
      this.shadowRoot.querySelector('input[name="title"]')?.focus();
    });

    this.shadowRoot.querySelectorAll("button.check").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = Number(button.dataset.taskId);
        this._expandedTaskId = this._expandedTaskId === taskId ? null : taskId;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("button.member").forEach((button) => {
      button.addEventListener("click", () => {
        const assignedTo = Number(button.dataset.assignedToUserId);
        this._complete(
          Number(button.dataset.taskId),
          Number(button.dataset.userId),
          Number.isInteger(assignedTo) && assignedTo > 0 ? assignedTo : null,
        );
      });
    });

    this.shadowRoot.querySelectorAll("button.create-member").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedCreateUserId = Number(button.dataset.createUserId);
        this.shadowRoot.querySelectorAll("button.create-member").forEach((candidate) => {
          const selected = candidate === button;
          candidate.classList.toggle("selected", selected);
          candidate.setAttribute("aria-pressed", String(selected));
        });
        this._formError = "";
        const error = this.shadowRoot.querySelector(".form-error");
        if (error) error.remove();
      });
    });

    this.shadowRoot.querySelector(".dialog-close")?.addEventListener("click", () => this._closeDialog());
    this.shadowRoot.querySelector(".cancel")?.addEventListener("click", () => this._closeDialog());
    const backdrop = this.shadowRoot.querySelector(".dialog-backdrop");
    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) this._closeDialog();
    });
    backdrop?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this._closeDialog();
    });

    this.shadowRoot.querySelector(".create-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      this._createTask({
        title: form.elements.namedItem("title")?.value,
        description: form.elements.namedItem("description")?.value,
        due: form.elements.namedItem("due")?.value,
        userId: this._selectedCreateUserId,
        frequencyType: form.elements.namedItem("frequencyType")?.value,
        priority: form.elements.namedItem("priority")?.value,
      });
    });
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<ha-card><div class="loading">Lade Aufgaben …</div></ha-card>`;
      return;
    }

    const tasks = this._tasks();
    const members = this._members();
    const rows = tasks.map((task) => {
      const taskId = Number(task.attributes.task_id);
      const assignedToId = Number(task.attributes.assigned_to_user_id);
      const assignedTo = Number.isInteger(assignedToId) && assignedToId > 0
        ? assignedToId
        : null;
      const assignedMember = members.find((member) => Number(member.user_id) === assignedToId);
      const assignedInitial = assignedMember ? this._memberInitial(assignedMember, members) : null;
      const expanded = this._expandedTaskId === taskId;
      const busy = this._busyTaskId === taskId;
      const checkContent = busy
        ? '<span class="spinner"></span>'
        : assignedInitial
          ? `<span class="assignee-initial">${this._escape(assignedInitial)}</span>`
          : '<ha-icon icon="mdi:checkbox-blank-circle-outline"></ha-icon>';
      const due = task.attributes.next_due_date;
      const chooser = expanded ? `
        <div class="chooser" aria-label="Erledigt von">
          <span class="chooser-label">Erledigt von</span>
          ${members.map((member) => `
            <button class="member" type="button"
              data-task-id="${taskId}" data-user-id="${Number(member.user_id)}" data-assigned-to-user-id="${assignedTo ?? ""}"
              title="${this._escape(member.display_name)}" aria-label="Erledigt von ${this._escape(member.display_name)}"
              ${busy ? "disabled" : ""}>${this._escape(this._memberInitial(member, members))}</button>
          `).join("")}
        </div>` : "";
      return `
        <div class="task ${expanded ? "expanded" : ""}">
          <div class="task-main">
            <button class="check" type="button" data-task-id="${taskId}"
              title="Erlediger auswählen" aria-label="Erlediger für ${this._escape(task.state)} auswählen"
              ${busy ? "disabled" : ""}>
              ${checkContent}
            </button>
            <div class="text">
              <div class="name">${this._escape(task.state)}</div>
              <div class="due ${this._isOverdue(due) ? "overdue" : ""}">${this._escape(this._dueText(due))}</div>
            </div>
          </div>
          ${chooser}
        </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { overflow: hidden; }
        .header { padding: 14px 14px 10px 20px; display: flex; align-items: center; gap: 12px; }
        .title { flex: 1; font-size: 1.25rem; font-weight: 600; color: var(--primary-text-color); }
        .count { font-size: .82rem; color: var(--secondary-text-color); }
        .add { width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
        .add:hover { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
        .add ha-icon { --mdc-icon-size: 25px; }
        .list { padding: 0 10px 10px; }
        .task { border-top: 1px solid var(--divider-color); padding: 8px 4px; transition: background .15s ease; }
        .task:first-child { border-top: 0; }
        .task.expanded { background: color-mix(in srgb, var(--primary-color) 6%, transparent); border-radius: 12px; }
        .task-main { min-height: 48px; display: flex; align-items: center; }
        button { font: inherit; }
        .check { width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
        .check:hover { background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
        .check ha-icon { --mdc-icon-size: 27px; }
        .assignee-initial { width: 28px; height: 28px; display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; font-size: .72rem; line-height: 1; font-weight: 700; }
        .text { min-width: 0; padding: 3px 8px 3px 2px; }
        .name { color: var(--primary-text-color); font-size: .98rem; line-height: 1.3; overflow-wrap: anywhere; }
        .due { color: var(--secondary-text-color); font-size: .78rem; margin-top: 2px; }
        .due.overdue { color: var(--error-color); }
        .chooser { display: flex; align-items: center; gap: 9px; padding: 4px 8px 8px 50px; }
        .chooser-label { color: var(--secondary-text-color); font-size: .78rem; margin-right: 2px; }
        .member { width: 34px; height: 34px; border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 50%; background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; box-shadow: none; }
        .member:hover { background: var(--primary-color); color: var(--text-primary-color); transform: translateY(-1px); }
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
        .create-member { min-width: 38px; height: 38px; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 19px; background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; }
        .create-member.selected { background: var(--primary-color); color: var(--text-primary-color); }
        .form-error { border-radius: 10px; padding: 10px 12px; background: color-mix(in srgb, var(--error-color) 12%, transparent); color: var(--error-color); font-size: .85rem; }
        .dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 2px; }
        .dialog-actions button { min-height: 40px; border: 0; border-radius: 10px; padding: 0 16px; cursor: pointer; }
        .cancel { background: transparent; color: var(--primary-text-color); }
        .save { background: var(--primary-color); color: var(--text-primary-color); font-weight: 600; }
        .status { margin: 0 14px 10px; border-radius: 10px; padding: 9px 12px; background: color-mix(in srgb, var(--success-color, #43a047) 12%, transparent); color: var(--primary-text-color); font-size: .84rem; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 420px) {
          .header { padding-inline: 16px; }
          .chooser { padding-left: 46px; }
          .chooser-label { display: none; }
        }
      </style>
      <ha-card>
        <div class="header">
          <div class="title">${this._escape(this._config.title)}</div>
          <div class="count">${tasks.length} offen</div>
          <button class="add" type="button" title="Aufgabe hinzufügen" aria-label="Aufgabe hinzufügen">
            <ha-icon icon="mdi:plus"></ha-icon>
          </button>
        </div>
        ${this._statusMessage ? `<div class="status" role="status">${this._escape(this._statusMessage)}</div>` : ""}
        <div class="list">${rows || '<div class="empty">Keine offenen Aufgaben</div>'}</div>
        ${this._dialogHtml(members)}
      </ha-card>`;
    this._bindEvents();
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

//