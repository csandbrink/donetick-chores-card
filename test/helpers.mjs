import fs from "node:fs";
import { JSDOM } from "jsdom";

const SOURCE = new URL("../dist/donetick-chores-card.js", import.meta.url);

export const MEMBERS = [
  { user_id: 1, display_name: "Christoph", username: "christoph" },
  { user_id: 2, display_name: "Iduna", username: "iduna" },
  { user_id: 3, display_name: "Jakob", username: "jakob" },
];

/**
 * Laedt die Karte in eine frische jsdom-Umgebung. Der Quelltext laeuft im
 * window-Kontext, benutzt also dieselben DOM-Klassen wie im Browser.
 *
 * @param {{adoptedStyleSheets?: boolean}} options
 */
export function loadCard({ adoptedStyleSheets = false } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  if (adoptedStyleSheets && !("adoptedStyleSheets" in window.ShadowRoot.prototype)) {
    // jsdom kennt adoptedStyleSheets nicht; fuer den Test des modernen Pfads
    // reicht eine schlichte Eigenschaft.
    Object.defineProperty(window.ShadowRoot.prototype, "adoptedStyleSheets", {
      configurable: true,
      writable: true,
      value: [],
    });
  }

  window.eval(fs.readFileSync(SOURCE, "utf8"));
  return { dom, window, document: window.document };
}

/** Erzeugt eine konfigurierte, in das Dokument eingehaengte Karte. */
export function makeCard(env, config = { todo_entity: "todo.all_tasks" }) {
  const card = env.document.createElement("donetick-chores-card");
  card.setConfig(config);
  env.document.body.append(card);
  return card;
}

/**
 * Baut ein hass-Objekt. `tasks` sind Kurzbeschreibungen:
 * { id, name, due, assignedTo, isActive }
 */
export function makeHass({
  tasks = [],
  members = MEMBERS,
  configEntryId = "CONFIG_ENTRY_1",
  extraStates = {},
  callService,
} = {}) {
  const states = {};
  for (const [entityId, state] of Object.entries(extraStates)) states[entityId] = state;

  states["todo.all_tasks"] = {
    entity_id: "todo.all_tasks",
    state: String(tasks.length),
    attributes: { circle_members: members, config_entry_id: configEntryId },
  };

  for (const task of tasks) {
    const entityId = `sensor.donetick_chores_${task.id}`;
    states[entityId] = {
      entity_id: entityId,
      state: task.name ?? `Aufgabe ${task.id}`,
      attributes: {
        task_id: task.id,
        is_active: task.isActive ?? true,
        next_due_date: task.due ?? null,
        assigned_to_user_id: task.assignedTo ?? null,
        description: "",
      },
    };
  }

  const calls = [];
  return {
    states,
    calls,
    callService: callService || (async (domain, service, data) => {
      calls.push({ domain, service, data });
    }),
  };
}

/** Kopiert ein hass-Objekt und ersetzt einzelne States (neue Referenzen). */
export function withStates(hass, replacements) {
  const states = { ...hass.states };
  for (const [entityId, patch] of Object.entries(replacements)) {
    if (patch === null) {
      delete states[entityId];
      continue;
    }
    const previous = states[entityId];
    states[entityId] = {
      ...previous,
      ...patch,
      attributes: { ...previous?.attributes, ...patch.attributes },
    };
  }
  return { ...hass, states };
}

/**
 * Objekte, die im jsdom-Kontext entstanden sind, tragen dessen Prototypen.
 * assert.deepStrictEqual vergleicht Prototypen mit und schlaegt dann fehl,
 * obwohl der Inhalt stimmt. Dieser Klartext-Abzug umgeht das.
 */
export const plain = (value) => JSON.parse(JSON.stringify(value));

export const sr = (card) => card.shadowRoot;
export const rows = (card) => [...card.shadowRoot.querySelectorAll(".task")];
export const text = (element) => (element ? element.textContent.trim() : null);
