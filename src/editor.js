// The visual card editor Home Assistant opens from "Edit card". It renders a
// single <ha-form> with a schema and turns its value-changed events into the
// config-changed events the dashboard editor listens for.
import { LANGUAGES, resolveLanguage, translate } from "./i18n.js";
import { GROUP_BY_VALUES } from "./card.js";

export const DEFAULT_SENSOR_PREFIX = "sensor.donetick_chores_";

export class DonetickChoresCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._form = null;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  _language() {
    return resolveLanguage(this._config.language, this._hass);
  }

  _t(key, params) {
    return translate(this._language(), key, params);
  }

  /** The ha-form schema. Exported through a method so tests can read it. */
  schema() {
    const t = (key) => this._t(key);
    return [
      {
        name: "todo_entity",
        required: true,
        selector: { entity: { domain: "todo" } },
      },
      { name: "title", selector: { text: {} } },
      { name: "sensor_prefix", selector: { text: {} } },
      {
        name: "language",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "", label: t("editor.language_auto") },
              ...LANGUAGES.map((language) => ({ value: language, label: t(`editor.language_${language}`) })),
            ],
          },
        },
      },
      { name: "show_filters", selector: { boolean: {} } },
      {
        name: "group_by",
        selector: {
          select: {
            mode: "dropdown",
            options: GROUP_BY_VALUES.map((value) => ({ value, label: t(`editor.group_by_${value}`) })),
          },
        },
      },
      { name: "compact", selector: { boolean: {} } },
      { name: "max_items", selector: { number: { min: 1, mode: "box", step: 1 } } },
    ];
  }

  // What the form shows: the config plus the defaults the card applies, so an
  // untouched option reads as what it does rather than as empty.
  _formData() {
    return {
      sensor_prefix: DEFAULT_SENSOR_PREFIX,
      language: "",
      show_filters: false,
      group_by: "none",
      compact: false,
      ...this._config,
    };
  }

  // Turns the form's value back into a config: defaults are left out again so
  // the YAML stays as short as it was.
  _configFrom(value) {
    const config = { ...this._config };
    const set = (key, next, isDefault) => {
      if (next === undefined || next === null || next === "" || isDefault) delete config[key];
      else config[key] = next;
    };
    set("todo_entity", value.todo_entity, false);
    set("title", value.title, false);
    set("sensor_prefix", value.sensor_prefix, value.sensor_prefix === DEFAULT_SENSOR_PREFIX);
    set("language", value.language, !LANGUAGES.includes(value.language));
    set("show_filters", value.show_filters, value.show_filters !== true);
    set("group_by", value.group_by, value.group_by === "none" || !GROUP_BY_VALUES.includes(value.group_by));
    set("compact", value.compact, value.compact !== true);
    const maxItems = Number(value.max_items);
    set("max_items", Number.isInteger(maxItems) && maxItems >= 1 ? maxItems : undefined, false);
    return config;
  }

  _render() {
    if (!this._form) {
      this._ensureHaForm();
      const form = document.createElement("ha-form");
      form.addEventListener("value-changed", (event) => {
        event.stopPropagation();
        const next = this._configFrom(event.detail?.value || {});
        this._config = next;
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: next },
          bubbles: true,
          composed: true,
        }));
      });
      this.shadowRoot.append(form);
      this._form = form;
    }
    const form = this._form;
    form.hass = this._hass;
    // HA sets hass on the editor on every state change; the schema only
    // depends on the language, so it is rebuilt only when that changes.
    const language = this._language();
    if (this._schemaLanguage !== language) {
      this._schemaLanguage = language;
      form.schema = this.schema();
    }
    form.data = this._formData();
    form.computeLabel = (field) => this._t(`editor.${field.name}`);
    form.computeHelper = (field) => {
      const key = `editor.${field.name}_helper`;
      const text = this._t(key);
      return text === key ? undefined : text;
    };
  }

  // ha-form is lazy-loaded by Home Assistant. The dashboard editor normally
  // has it by the time a custom editor opens; when it does not, opening a
  // built-in card editor pulls it in. Best effort only - nothing here may throw.
  _ensureHaForm() {
    if (customElements.get("ha-form")) return;
    try {
      const loadHelpers = window.loadCardHelpers;
      if (typeof loadHelpers !== "function") return;
      Promise.resolve(loadHelpers())
        .then((helpers) => {
          const card = helpers?.createCardElement?.({ type: "entities", entities: [] });
          return card?.constructor?.getConfigElement?.();
        })
        .catch(() => undefined);
    } catch {
      // Older frontends without loadCardHelpers: the form appears once HA
      // itself has loaded ha-form.
    }
  }
}
