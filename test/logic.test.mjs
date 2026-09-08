import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, MEMBERS } from "./helpers.mjs";

/** ISO timestamp for "n days from now, midday local time". Midday so that
 *  neither the time zone nor a DST switch can tip the calendar day over. */
const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const card = () => makeCard(loadCard());

describe("_dueText", () => {
  test("no due date says nothing at all", () => {
    // Chores without a due date used to read "Ohne Termin", which is noise on
    // a wall dashboard - the absence of a date already says it.
    assert.equal(card()._dueText(null), "");
    assert.equal(card()._dueText(""), "");
  });

  test("an unreadable due date is named rather than hidden", () => {
    assert.equal(card()._dueText("übermorgen vielleicht"), "Termin ungültig");
  });

  test("today, tomorrow, yesterday", () => {
    const c = card();
    assert.equal(c._dueText(inDays(0)), "Heute fällig");
    assert.equal(c._dueText(inDays(1)), "Morgen fällig");
    assert.equal(c._dueText(inDays(-1)), "Seit gestern fällig");
  });

  test("longer overdue gets counted", () => {
    assert.equal(card()._dueText(inDays(-4)), "Seit 4 Tagen fällig");
  });

  test("further out it shows the date", () => {
    const value = inDays(5);
    const expected = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" })
      .format(new Date(value));
    assert.equal(card()._dueText(value), `Fällig ${expected}`);
  });
});

describe("_isOverdue", () => {
  test("past yes, future no, nothing no", () => {
    const c = card();
    assert.equal(c._isOverdue(inDays(-1)), true);
    assert.equal(c._isOverdue(inDays(1)), false);
    assert.equal(c._isOverdue(null), false);
  });
});

describe("_memberInitial", () => {
  test("unambiguous names get a single letter", () => {
    const c = card();
    assert.equal(c._memberInitial(MEMBERS[0], MEMBERS), "C");
    assert.equal(c._memberInitial(MEMBERS[1], MEMBERS), "I");
  });

  test("a shared first letter expands to two characters", () => {
    const members = [
      { user_id: 1, display_name: "Jakob" },
      { user_id: 2, display_name: "Jana" },
      { user_id: 3, display_name: "Paul" },
    ];
    const c = card();
    assert.equal(c._memberInitial(members[0], members), "Ja");
    assert.equal(c._memberInitial(members[1], members), "Ja");
    assert.equal(c._memberInitial(members[2], members), "P", "an unrelated name stays short");
  });

  test("a missing name becomes ?", () => {
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

  test("identical states object: nothing to do", () => {
    const { c, hass } = setup();
    assert.equal(c._relevantChange(hass, { ...hass }), false);
  });

  test("same references in a new container: nothing to do", () => {
    const { c, hass } = setup();
    assert.equal(c._relevantChange(hass, clone(hass)), false);
  });

  test("unrelated entity changed: nothing to do", () => {
    const { c, hass } = setup();
    const next = clone(hass, { "light.kueche": { entity_id: "light.kueche", state: "on", attributes: {} } });
    assert.equal(c._relevantChange(hass, next), false);
  });

  test("chore sensor changed: re-render", () => {
    const { c, hass } = setup();
    const next = clone(hass, {
      "sensor.donetick_chores_1": { ...hass.states["sensor.donetick_chores_1"], state: "anders" },
    });
    assert.equal(c._relevantChange(hass, next), true);
  });

  test("todo entity changed: re-render", () => {
    const { c, hass } = setup();
    const next = clone(hass, { "todo.all_tasks": { ...hass.states["todo.all_tasks"], state: "9" } });
    assert.equal(c._relevantChange(hass, next), true);
  });

  test("sensor added or removed: re-render", () => {
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

  test("unchanged due date: the booking is still pending", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([taskState(1, "2026-09-10T00:00:00Z")]);
    assert.equal(c._completedTasks.has(1), true);
  });

  test("new due date: Donetick has processed the booking", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([taskState(1, "2026-09-11T00:00:00Z")]);
    assert.equal(c._completedTasks.has(1), false);
  });

  test("chore gone: a one-off chore is done", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: "2026-09-10T00:00:00Z", at: Date.now() });
    c._pruneCompleted([]);
    assert.equal(c._completedTasks.has(1), false);
  });

  test("a chore without a due date stays booked until the safety timeout", () => {
    const c = card();
    c._completedTasks.set(1, { dueAtCompletion: null, at: Date.now() });
    c._pruneCompleted([taskState(1, null)]);
    assert.equal(c._completedTasks.has(1), true);

    c._completedTasks.set(1, { dueAtCompletion: null, at: Date.now() - 121000 });
    c._pruneCompleted([taskState(1, null)]);
    assert.equal(c._completedTasks.has(1), false, "after 120 s the card releases the row");
  });
});

describe("getStubConfig", () => {
  test("finds the Donetick list by its circle_members", () => {
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

  test("falls back when no entity matches", () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    assert.equal(CardClass.getStubConfig({ states: {} }).todo_entity, "todo.all_tasks");
    assert.equal(CardClass.getStubConfig(undefined).todo_entity, "todo.all_tasks");
  });
});

describe("Card sizing", () => {
  test("grows with the number of chores", () => {
    const env = loadCard();
    const c = makeCard(env);
    assert.equal(c.getCardSize(), 1);
    c.hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.equal(c.getCardSize(), 4);
  });

  test("reports grid options for the sections layout", () => {
    assert.deepEqual({ ...card().getGridOptions() }, { rows: "auto", columns: "full", min_columns: 6 });
  });
});
