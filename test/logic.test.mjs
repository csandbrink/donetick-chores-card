import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, MEMBERS } from "./helpers.mjs";

/** ISO-Zeitpunkt für "in n Tagen, 12 Uhr Ortszeit" – mittags, damit weder
 *  Zeitzone noch Sommerzeitumstellung den Kalendertag kippen können. */
const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const card = () => makeCard(loadCard());

describe("_dueText", () => {
  test("ohne Termin", () => {
    assert.equal(card()._dueText(null), "Ohne Termin");
    assert.equal(card()._dueText(""), "Ohne Termin");
  });

  test("unlesbarer Termin wird benannt statt verschwiegen", () => {
    assert.equal(card()._dueText("übermorgen vielleicht"), "Termin ungültig");
  });

  test("heute, morgen, gestern", () => {
    const c = card();
    assert.equal(c._dueText(inDays(0)), "Heute fällig");
    assert.equal(c._dueText(inDays(1)), "Morgen fällig");
    assert.equal(c._dueText(inDays(-1)), "Seit gestern fällig");
  });

  test("länger überfällig wird gezählt", () => {
    assert.equal(card()._dueText(inDays(-4)), "Seit 4 Tagen fällig");
  });

  test("weiter in der Zukunft steht das Datum", () => {
    const value = inDays(5);
    const expected = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" })
      .format(new Date(value));
    assert.equal(card()._dueText(value), `Fällig ${expected}`);
  });
});

describe("_isOverdue", () => {
  test("Vergangenheit ja, Zukunft nein, nichts nein", () => {
    const c = card();
    assert.equal(c._isOverdue(inDays(-1)), true);
    assert.equal(c._isOverdue(inDays(1)), false);
    assert.equal(c._isOverdue(null), false);
  });
});

describe("_memberInitial", () => {
  test("eindeutige Namen bekommen einen Buchstaben", () => {
    const c = card();
    assert.equal(c._memberInitial(MEMBERS[0], MEMBERS), "C");
    assert.equal(c._memberInitial(MEMBERS[1], MEMBERS), "I");
  });

  test("bei gleicher Anfangsinitiale wird auf zwei Zeichen erweitert", () => {
    const members = [
      { user_id: 1, display_name: "Jakob" },
      { user_id: 2, display_name: "Jana" },
      { user_id: 3, display_name: "Paul" },
    ];
    const c = card();
    assert.equal(c._memberInitial(members[0], members), "Ja");
    assert.equal(c._memberInitial(members[1], members), "Ja");
    assert.equal(c._memberInitial(members[2], members), "P", "unbeteiligter Name bleibt kurz");
  });

  test("fehlender Name wird zu ?", () => {
    const members = [{ user_id: 1, display_name: "" }];
    assert.equal(card()._memberInitial(members[0], members), "?");
  });
});

describe("_relevantChange", () => {
  const setup = () => {
    const c = card();
    const hass = makeHass({ tasks: [{ id: 1 }] });
    return { c, hass };
  };
  const clone = (hass, changes = {}) => ({ ...hass, states: { ...hass.states, ...changes } });

  test("identisches states-Objekt: nichts zu tun", () => {
    const { c, hass } = setup();
    assert.equal(c._relevantChange(hass, { ...hass }), false);
  });

  test("gleiche Referenzen in neuem Container: nichts zu tun", () => {
    const { c, hass } = setup();
    assert.equal(c._relevantChange(hass, clone(hass)), false);
  });

  test("fremde Entity geändert: nichts zu tun", () => {
    const { c, hass } = setup();
    const next = clone(hass, { "light.kueche": { entity_id: "light.kueche", state: "on", attributes: {} } });
    assert.equal(c._relevantChange(hass, next), false);
  });

  test("Aufgaben-Sensor geändert: neu rendern", () => {
    const { c, hass } = setup();
    const next = clone(hass, {
      "sensor.donetick_chores_1": { ...hass.states["sensor.donetick_chores_1"], state: "anders" },
    });
    assert.equal(c._relevantChange(hass, next), true);
  });

  test("todo-Entity geändert: neu rendern", () => {
    const { c, hass } = setup();
    const next = clone(hass, { "todo.all_tasks": { ...hass.states["todo.all_tasks"], state: "9" } });
    assert.equal(c._relevantChange(hass, next), true);
  });

  test("Sensor hinzugekommen oder entfernt: neu rendern", () => {
    const { c, hass } = setup();
    const added = clone(hass, {
      "sensor.donetick_chores_2": { entity_id: "sensor.donetick_chores_2", state: "neu", attributes: { task_id: 2 } },
    });
    assert.equal(c._relevantChange(hass, added), true);

    const removed = { ...hass, states: { ...hass.states } };
    delete removed.states["sensor.donetick_chores_1"];
    assert.equal(c._relevantChange(hass, removed), true);
  });
});

describe("_pruneCompleted", () => {
  const taskState = (id, due) => ({
    entity_id: `sensor.donetick_chores_${id}`,
    state: `Aufgabe ${id}`,
    attributes: { task_id: id, next_due_date: due ?? null, is_active: true },
  });

  test("unveränderter Termin: Buchung gilt weiter als offen", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([taskState(1, "2026-09-10T00:00:00Z")]);
    assert.equal(c._completedTasks.has(1), true);
  });

  test("neuer Termin: Donetick hat die Buchung verarbeitet", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([taskState(1, "2026-09-11T00:00:00Z")]);
    assert.equal(c._completedTasks.has(1), false);
  });

  test("Aufgabe verschwunden: Einmalaufgabe ist erledigt", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([]);
    assert.equal(c._completedTasks.has(1), false);
  });

  test("Aufgabe ohne Termin bleibt bis zum Notausgang gebucht", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: null, at: Date.now() });
    c._pruneCompleted([taskState(1, null)]);
    assert.equal(c._completedTasks.has(1), true);

    c._completedTasks.set(1, { dueAtCompletion: null, at: Date.now() - 121000 });
    c._pruneCompleted([taskState(1, null)]);
    assert.equal(c._completedTasks.has(1), false, "nach 120 s gibt die Karte die Zeile frei");
  });
});

describe("getStubConfig", () => {
  test("findet die Donetick-Liste an ihren circle_members", () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    const hass = {
      states: {
        "todo.einkaufsliste": { entity_id: "todo.einkaufsliste", state: "3", attributes: {} },
        "todo.haushalt": {
          entity_id: "todo.haushalt",
          state: "1",
          attributes: { circle_members: MEMBERS, config_entry_id: "X" },
        },
      },
    };
    assert.equal(CardClass.getStubConfig(hass).todo_entity, "todo.haushalt");
  });

  test("ohne passende Entity bleibt der Rückfall", () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    assert.equal(CardClass.getStubConfig({ states: {} }).todo_entity, "todo.all_tasks");
    assert.equal(CardClass.getStubConfig(undefined).todo_entity, "todo.all_tasks");
  });
});

describe("Kartengröße", () => {
  test("wächst mit der Anzahl der Aufgaben", () => {
    const env = loadCard();
    const c = makeCard(env);
    assert.equal(c.getCardSize(), 1);
    c.hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.equal(c.getCardSize(), 4);
  });

  test("meldet Grid-Optionen für das Sections-Layout", () => {
    assert.deepEqual({ ...card().getGridOptions() }, { rows: "auto", columns: "full", min_columns: 6 });
  });
});
