import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, plain, MEMBERS } from "./helpers.mjs";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** ISO timestamp for "n days from now, midday local time". */
const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const submit = (env, dialog) =>
  dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));

const openCreate = (card) => {
  card.shadowRoot.querySelector("button.add").click();
  return card._dialog;
};

const expand = (card, index = 0) => {
  const row = rows(card)[index];
  row.querySelector("button.check").click();
  return row;
};

const actionButton = (row, action) => row.querySelector(`button.row-action[data-action="${action}"]`);

// ---------------------------------------------------------------------------
// Visual editor
// ---------------------------------------------------------------------------

describe("Visual editor", () => {
  const makeEditor = (env, config, hass) => {
    const editor = env.document.createElement("donetick-chores-card-editor");
    if (hass) editor.hass = hass;
    editor.setConfig(config);
    env.document.body.append(editor);
    return editor;
  };

  test("getConfigElement returns the registered editor element", () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    const editor = CardClass.getConfigElement();
    assert.equal(editor.tagName.toLowerCase(), "donetick-chores-card-editor");
    assert.ok(env.window.customElements.get("donetick-chores-card-editor"));
  });

  test("renders one ha-form with a schema covering every option", () => {
    const env = loadCard();
    const editor = makeEditor(env, { todo_entity: "todo.all_tasks" });
    const form = editor.shadowRoot.querySelector("ha-form");
    assert.ok(form, "an ha-form element");
    assert.deepEqual(
      plain(form.schema.map((field) => field.name)),
      ["todo_entity", "title", "sensor_prefix", "language", "show_filters", "group_by", "compact", "max_items"],
    );
    assert.deepEqual(plain(form.schema[0].selector), { entity: { domain: "todo" } });
    assert.equal(form.schema[0].required, true);
    assert.deepEqual(plain(form.data), {
      todo_entity: "todo.all_tasks",
      sensor_prefix: "sensor.donetick_chores_",
      language: "",
      show_filters: false,
      group_by: "none",
      compact: false,
    });
  });

  test("labels and helpers are translated, following the language option", () => {
    const env = loadCard();
    const german = makeEditor(env, { todo_entity: "todo.a" });
    const form = german.shadowRoot.querySelector("ha-form");
    assert.equal(form.computeLabel({ name: "todo_entity" }), "Donetick-Todo-Entität");
    assert.equal(form.computeLabel({ name: "compact" }), "Kompakte Darstellung (Wandtablet)");
    assert.equal(form.computeHelper({ name: "max_items" }), "Leer lassen, um alle anzuzeigen.");
    assert.equal(form.computeHelper({ name: "title" }), undefined, "no helper key, no helper text");

    const english = makeEditor(env, { todo_entity: "todo.a", language: "en" });
    const englishForm = english.shadowRoot.querySelector("ha-form");
    assert.equal(englishForm.computeLabel({ name: "todo_entity" }), "Donetick todo entity");
    assert.equal(englishForm.computeLabel({ name: "group_by" }), "Grouping");
    const groupOptions = englishForm.schema.find((field) => field.name === "group_by").selector.select.options;
    assert.deepEqual(plain(groupOptions), [{ value: "none", label: "None" }, { value: "due", label: "By due date" }]);

    // Without a language option the editor follows Home Assistant.
    const viaHass = makeEditor(env, { todo_entity: "todo.a" }, { states: {}, locale: { language: "en" } });
    assert.equal(viaHass.shadowRoot.querySelector("ha-form").computeLabel({ name: "title" }), "Heading");
  });

  test("a form change fires config-changed with defaults stripped", () => {
    const env = loadCard();
    const editor = makeEditor(env, { todo_entity: "todo.all_tasks", title: "Haushalt" });
    const events = [];
    editor.addEventListener("config-changed", (event) => events.push(event));

    const form = editor.shadowRoot.querySelector("ha-form");
    form.dispatchEvent(new env.window.CustomEvent("value-changed", {
      detail: {
        value: {
          todo_entity: "todo.haushalt",
          title: "",
          sensor_prefix: "sensor.donetick_chores_",
          language: "en",
          show_filters: true,
          group_by: "due",
          compact: false,
          max_items: 5,
        },
      },
      bubbles: true,
      composed: true,
    }));

    assert.equal(events.length, 1);
    assert.ok(events[0] instanceof env.window.CustomEvent);
    assert.equal(events[0].bubbles, true);
    assert.equal(events[0].composed, true);
    assert.deepEqual(plain(events[0].detail.config), {
      todo_entity: "todo.haushalt",
      language: "en",
      show_filters: true,
      group_by: "due",
      max_items: 5,
    });
    // The emitted config is one the card accepts.
    assert.doesNotThrow(() => makeCard(env, events[0].detail.config));
  });

  test("the emitted config keeps unknown keys and drops an invalid max_items", () => {
    const env = loadCard();
    const editor = makeEditor(env, { todo_entity: "todo.a", custom_thing: 1 });
    let config;
    editor.addEventListener("config-changed", (event) => { config = event.detail.config; });
    editor.shadowRoot.querySelector("ha-form").dispatchEvent(new env.window.CustomEvent("value-changed", {
      detail: { value: { todo_entity: "todo.a", max_items: 0, language: "", group_by: "none" } },
    }));
    assert.deepEqual(plain(config), { todo_entity: "todo.a", custom_thing: 1 });
  });

  test("survives being rendered without hass or ha-form support", () => {
    const env = loadCard();
    assert.doesNotThrow(() => makeEditor(env, {}));
    assert.doesNotThrow(() => makeEditor(env, undefined));
  });
});

// ---------------------------------------------------------------------------
// Person filter
// ---------------------------------------------------------------------------

describe("Person filter", () => {
  const chips = (card) => [...card.shadowRoot.querySelectorAll("button.filter")];
  const names = (card) => rows(card).map((row) => text(row.querySelector(".name")));
  const tasks = [
    { id: 1, name: "Christophs", assignedTo: 1 },
    { id: 2, name: "Idunas", assignedTo: 2 },
    { id: 3, name: "Niemandes" },
  ];

  test("is off by default and leaves the list untouched", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks });
    assert.equal(card.shadowRoot.querySelector(".filters").hidden, true);
    assert.equal(chips(card).length, 0);
    assert.equal(names(card).length, 3);
  });

  test("shows All, one chip per member and Unassigned, with aria-pressed", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    card.hass = makeHass({ tasks });
    const bar = card.shadowRoot.querySelector(".filters");
    assert.equal(bar.hidden, false);
    assert.equal(bar.getAttribute("role"), "group");
    assert.equal(bar.getAttribute("aria-label"), "Nach Person filtern");
    assert.deepEqual(chips(card).map(text), ["Alle", "Christoph", "Iduna", "Jakob", "Unzugewiesen"]);
    assert.deepEqual(chips(card).map((chip) => chip.getAttribute("aria-pressed")), ["true", "false", "false", "false", "false"]);
  });

  test("filters by member and by unassigned, and the counter follows", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    card.hass = makeHass({ tasks });

    chips(card)[2].click();
    assert.deepEqual(names(card), ["Idunas"]);
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");
    assert.deepEqual(chips(card).map((chip) => chip.getAttribute("aria-pressed")), ["false", "false", "true", "false", "false"]);

    chips(card)[4].click();
    assert.deepEqual(names(card), ["Niemandes"]);

    chips(card)[3].click();
    assert.equal(card.shadowRoot.querySelector(".empty") !== null, true, "Jakob has nothing: empty state");
    assert.equal(text(card.shadowRoot.querySelector(".count")), "0 offen");

    chips(card)[0].click();
    assert.equal(names(card).length, 3);
    assert.equal(text(card.shadowRoot.querySelector(".count")), "3 offen");
  });

  test("the selection survives data updates and a title change, not a source switch", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    const hass = makeHass({ tasks });
    card.hass = hass;
    chips(card)[1].click();
    assert.deepEqual(names(card), ["Christophs"]);

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "Christophs neu" } });
    assert.deepEqual(names(card), ["Christophs neu"]);
    assert.equal(card._filter, 1);

    card.setConfig({ todo_entity: "todo.all_tasks", show_filters: true, title: "Neu" });
    assert.equal(card._filter, 1, "same source: the filter stays");

    card.setConfig({ todo_entity: "todo.other", show_filters: true });
    assert.equal(card._filter, null, "another source: the filter is dropped");
  });

  test("a filter on a member who left falls back to All", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    const hass = makeHass({ tasks });
    card.hass = hass;
    chips(card)[2].click();
    assert.deepEqual(names(card), ["Idunas"]);

    card.hass = withStates(hass, { "todo.all_tasks": { attributes: { circle_members: [MEMBERS[0], MEMBERS[2]] } } });
    assert.equal(card._filter, null);
    assert.equal(names(card).length, 3);
    assert.deepEqual(chips(card).map(text), ["Alle", "Christoph", "Jakob", "Unzugewiesen"]);
    assert.equal(chips(card)[0].getAttribute("aria-pressed"), "true");
  });

  test("chip nodes are reused across renders, so focus survives", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    const hass = makeHass({ tasks });
    card.hass = hass;
    const chip = chips(card)[1];
    chip.focus();
    chip.click();
    assert.equal(card.shadowRoot.activeElement, chip);
    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "x" } });
    assert.equal(chips(card)[1], chip);
    assert.equal(card.shadowRoot.activeElement, chip);
  });

  test("switching show_filters off clears the filter", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    card.hass = makeHass({ tasks });
    chips(card)[2].click();
    card.setConfig({ todo_entity: "todo.all_tasks" });
    assert.equal(card._filter, null);
    assert.equal(names(card).length, 3);
    assert.equal(card.shadowRoot.querySelector(".filters").hidden, true);
  });

  test("English labels", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true, language: "en" });
    card.hass = makeHass({ tasks });
    assert.deepEqual(chips(card).map(text), ["All", "Christoph", "Iduna", "Jakob", "Unassigned"]);
    assert.equal(card.shadowRoot.querySelector(".filters").getAttribute("aria-label"), "Filter by person");
  });

  test("a language switch re-labels the chips and keeps the selection", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", show_filters: true });
    const hass = makeHass({ tasks });
    card.hass = hass;
    chips(card)[4].click();
    card.hass = { ...hass, locale: { language: "en" } };
    assert.deepEqual(chips(card).map(text), ["All", "Christoph", "Iduna", "Jakob", "Unassigned"]);
    assert.equal(chips(card)[4].getAttribute("aria-pressed"), "true");
    assert.deepEqual(names(card), ["Niemandes"]);
  });
});

// ---------------------------------------------------------------------------
// Grouping by due date
// ---------------------------------------------------------------------------

describe("Grouping by due date", () => {
  const tasks = [
    { id: 1, name: "alt", due: inDays(-3) },
    { id: 2, name: "heute", due: inDays(0) },
    { id: 3, name: "bald", due: inDays(3) },
    { id: 4, name: "irgendwann", due: inDays(20) },
    { id: 5, name: "nie" },
  ];
  const headers = (card) => [...card.shadowRoot.querySelectorAll(".group-header")].map(text);

  test("group_by defaults to none: no group elements at all", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks });
    assert.equal(card.shadowRoot.querySelectorAll(".group").length, 0);
    assert.equal(rows(card).length, 5);
    assert.equal(card.shadowRoot.querySelector(".list").firstElementChild.classList.contains("task"), true);
  });

  test("groups with translated headings, counts, and the overall counter", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    card.hass = makeHass({ tasks });
    assert.deepEqual(headers(card), ["Überfällig (1)", "Heute (1)", "Diese Woche (1)", "Später (1)", "Ohne Termin (1)"]);
    assert.equal(rows(card).length, 5);
    assert.equal(text(card.shadowRoot.querySelector(".count")), "5 offen");
    const header = card.shadowRoot.querySelector(".group-header");
    assert.equal(header.getAttribute("role"), "heading");
    assert.equal(header.getAttribute("aria-level"), "3");
    assert.deepEqual(
      [...card.shadowRoot.querySelectorAll(".group-overdue .name")].map(text),
      ["alt"],
    );
  });

  test("empty groups are not rendered", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    card.hass = makeHass({ tasks: [{ id: 2, name: "heute", due: inDays(0) }, { id: 6, name: "auch heute", due: inDays(0) }] });
    assert.deepEqual(headers(card), ["Heute (2)"]);
  });

  test("an unreadable due date lands in the group without a date", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    card.hass = makeHass({ tasks: [{ id: 1, name: "kaputt", due: "kein datum" }] });
    assert.deepEqual(headers(card), ["Ohne Termin (1)"]);
  });

  test("a chore moves between groups while keeping its node", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    const hass = makeHass({ tasks: [{ id: 1, name: "wandert", due: inDays(0) }, { id: 2, name: "bleibt", due: inDays(1) }] });
    card.hass = hass;
    const node = rows(card)[0];
    assert.deepEqual(headers(card), ["Heute (1)", "Diese Woche (1)"]);

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { attributes: { next_due_date: inDays(30) } } });
    assert.deepEqual(headers(card), ["Diese Woche (1)", "Später (1)"]);
    assert.equal(card.shadowRoot.querySelector(".group-later .task"), node);
  });

  test("unchanged data leaves the group nodes alone", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    const hass = makeHass({ tasks });
    card.hass = hass;
    const before = [...card.shadowRoot.querySelectorAll(".group")];
    card.hass = withStates(hass, { "sensor.donetick_chores_2": { state: "heute neu" } });
    assert.deepEqual([...card.shadowRoot.querySelectorAll(".group")], before);
  });

  test("completing inside a group keeps the counter correct", async () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    card.hass = makeHass({ tasks });
    card.shadowRoot.querySelector(".group-overdue button.check").click();
    card.shadowRoot.querySelector(".group-overdue button.member").click();
    await flush();
    assert.equal(text(card.shadowRoot.querySelector(".count")), "4 offen");
    assert.ok(card.shadowRoot.querySelector(".group-overdue .task").classList.contains("done"));
  });

  test("switching group_by at runtime rearranges the same rows", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    card.hass = makeHass({ tasks });
    const before = rows(card);
    card.setConfig({ todo_entity: "todo.all_tasks" });
    assert.equal(card.shadowRoot.querySelectorAll(".group").length, 0);
    assert.deepEqual(rows(card), before, "the row nodes are reused");
  });

  test("English headings and a runtime language switch", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due" });
    const hass = makeHass({ tasks });
    card.hass = hass;
    card.hass = { ...hass, locale: { language: "en" } };
    assert.deepEqual(headers(card), ["Overdue (1)", "Today (1)", "This week (1)", "Later (1)", "No due date (1)"]);
  });

  test("works together with the person filter", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", group_by: "due", show_filters: true });
    card.hass = makeHass({ tasks: [{ id: 1, name: "a", due: inDays(-1), assignedTo: 1 }, { id: 2, name: "b", due: inDays(0), assignedTo: 2 }] });
    card.shadowRoot.querySelectorAll("button.filter")[2].click();
    assert.deepEqual(headers(card), ["Heute (1)"]);
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");
  });
});

// ---------------------------------------------------------------------------
// Recurrence in the create dialog
// ---------------------------------------------------------------------------

describe("Recurrence: interval and weekdays", () => {
  test("the interval and weekday fields appear only for their type", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = openCreate(card);
    const intervalRow = dialog.section.querySelector(".interval-row");
    const weekdays = dialog.section.querySelector(".weekdays");
    assert.equal(intervalRow.hidden, true);
    assert.equal(weekdays.hidden, true);

    dialog.frequencyType.value = "interval";
    dialog.frequencyType.dispatchEvent(new env.window.Event("change"));
    assert.equal(intervalRow.hidden, false);
    assert.equal(weekdays.hidden, true);
    assert.equal(dialog.interval.type, "number");
    assert.equal(dialog.interval.min, "1");
    assert.equal(dialog.interval.value, "1");

    dialog.frequencyType.value = "days_of_the_week";
    dialog.frequencyType.dispatchEvent(new env.window.Event("change"));
    assert.equal(intervalRow.hidden, true);
    assert.equal(weekdays.hidden, false);
    assert.deepEqual([...dialog.weekdayButtons.values()].map(text), ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    assert.deepEqual([...dialog.weekdayButtons.values()].map((b) => b.getAttribute("aria-pressed")), Array(7).fill("false"));
    assert.equal(dialog.weekdayButtons.get("monday").getAttribute("aria-label"), "Montag");
  });

  test("the plain types still send frequency 1 and no metadata", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = openCreate(card);
    dialog.title.value = "Monatlich";
    dialog.frequencyType.value = "monthly";
    submit(env, dialog);
    await flush();
    assert.equal(hass.calls[0].data.frequency_type, "monthly");
    assert.equal(hass.calls[0].data.frequency, 1);
    assert.equal("frequency_metadata" in hass.calls[0].data, false);
  });

  test("every N weeks: frequency, unit, time and timezone go to create_chore", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = openCreate(card);
    dialog.title.value = "Bettwäsche";
    dialog.due.value = "2026-10-10T09:30";
    dialog.frequencyType.value = "interval";
    dialog.interval.value = "3";
    dialog.intervalUnit.value = "weeks";
    submit(env, dialog);
    await flush();

    assert.equal(hass.calls.length, 1);
    const { data } = hass.calls[0];
    assert.equal(data.frequency_type, "interval");
    assert.strictEqual(data.frequency, 3);
    assert.equal(data.frequency_metadata.unit, "weeks");
    assert.equal(data.frequency_metadata.time, new Date("2026-10-10T09:30").toISOString(), "the due date's time of day");
    assert.equal(typeof data.frequency_metadata.timezone, "string");
    assert.equal("days" in data.frequency_metadata, false);
    assert.equal(data.next_due_date, new Date("2026-10-10T09:30").toISOString());
    assert.equal(card._dialog, null);
  });

  test("without a due date the time of day is 18:00 today, as in Donetick", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    await card._createTask({ title: "x", frequencyType: "interval", interval: "2", intervalUnit: "days", userId: null });
    const expected = new Date();
    expected.setHours(18, 0, 0, 0);
    assert.equal(hass.calls[0].data.frequency_metadata.time, expected.toISOString());
    assert.equal("next_due_date" in hass.calls[0].data, false);
  });

  test("an invalid interval is reported instead of sent", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = openCreate(card);
    for (const bad of ["0", "-2", "1.5", "abc", ""]) {
      await card._createTask({ title: "x", frequencyType: "interval", interval: bad, intervalUnit: "days", userId: null });
      assert.equal(hass.calls.length, 0, `interval ${JSON.stringify(bad)} must not be sent`);
      assert.equal(text(dialog.formError), "Das Intervall muss eine ganze Zahl ab 1 sein.");
      assert.equal(card._busyCreate, false);
    }
    assert.equal(card._dialog, dialog, "the dialog stays open");
  });

  test("an unknown unit falls back to days", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    await card._createTask({ title: "x", frequencyType: "interval", interval: "4", intervalUnit: "fortnights", userId: null });
    assert.equal(hass.calls[0].data.frequency_metadata.unit, "days");
  });

  test("weekdays: the picked days go out as lower-case English names", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = openCreate(card);
    dialog.title.value = "Müll";
    dialog.frequencyType.value = "days_of_the_week";
    dialog.weekdayButtons.get("tuesday").click();
    dialog.weekdayButtons.get("friday").click();
    assert.equal(dialog.weekdayButtons.get("tuesday").getAttribute("aria-pressed"), "true");
    dialog.weekdayButtons.get("tuesday").click();
    assert.equal(dialog.weekdayButtons.get("tuesday").getAttribute("aria-pressed"), "false", "a second tap unselects");
    dialog.weekdayButtons.get("monday").click();
    submit(env, dialog);
    await flush();

    const { data } = hass.calls[0];
    assert.equal(data.frequency_type, "days_of_the_week");
    assert.strictEqual(data.frequency, 1);
    assert.deepEqual(plain(data.frequency_metadata.days), ["monday", "friday"]);
    assert.equal(data.frequency_metadata.weekPattern, "every_week");
    assert.equal(typeof data.frequency_metadata.time, "string");
    assert.equal("unit" in data.frequency_metadata, false);
  });

  test("weekdays without a selection are rejected, junk days are dropped", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = openCreate(card);
    dialog.title.value = "x";
    dialog.frequencyType.value = "days_of_the_week";
    submit(env, dialog);
    await flush();
    assert.equal(hass.calls.length, 0);
    assert.equal(text(dialog.formError), "Bitte mindestens einen Wochentag auswählen.");

    await card._createTask({ title: "x", frequencyType: "days_of_the_week", weekdays: ["funday", "sunday"], userId: null });
    assert.deepEqual(plain(hass.calls[0].data.frequency_metadata.days), ["sunday"]);
  });

  test("the interval and weekday input survives a language switch", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const before = openCreate(card);
    before.frequencyType.value = "days_of_the_week";
    before.frequencyType.dispatchEvent(new env.window.Event("change"));
    before.weekdayButtons.get("saturday").click();
    before.interval.value = "5";
    before.intervalUnit.value = "months";

    card.hass = { ...hass, locale: { language: "en" } };
    const after = card._dialog;
    assert.notEqual(after, before);
    assert.equal(after.frequencyType.value, "days_of_the_week");
    assert.deepEqual(plain(after.selectedWeekdays()), ["saturday"]);
    assert.equal(after.weekdayButtons.get("saturday").getAttribute("aria-pressed"), "true");
    assert.equal(after.interval.value, "5");
    assert.equal(after.intervalUnit.value, "months");
    assert.equal(after.section.querySelector(".weekdays").hidden, false, "the right fields are shown again");
    assert.equal(after.section.querySelector(".interval-row").hidden, true);
    assert.equal(text(after.weekdayButtons.get("saturday")), "Sat");
  });

  test("English error texts", async () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", language: "en" });
    card.hass = makeHass({ tasks: [] });
    const dialog = openCreate(card);
    await card._createTask({ title: "x", frequencyType: "interval", interval: "0", userId: null });
    assert.equal(text(dialog.formError), "The interval must be a whole number of 1 or more.");
    await card._createTask({ title: "x", frequencyType: "days_of_the_week", weekdays: [], userId: null });
    assert.equal(text(dialog.formError), "Please pick at least one weekday.");
  });

  test("Tab skips the hidden recurrence fields", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = openCreate(card);
    const focusable = [...dialog.section.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")]
      .filter((element) => !element.closest("[hidden]"));
    const last = focusable[focusable.length - 1];
    last.focus();
    const forward = new env.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(forward);
    assert.equal(card.shadowRoot.activeElement, focusable[0]);
    assert.ok(!focusable.includes(dialog.interval), "the hidden interval field is not in the cycle");
  });
});

// ---------------------------------------------------------------------------
// Editing and deleting
// ---------------------------------------------------------------------------

describe("Editing a chore", () => {
  test("the expanded row offers Edit and Delete", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: "Müll" }] });
    const row = rows(card)[0];
    assert.equal(row.querySelector(".row-actions").hidden, true);
    expand(card);
    assert.equal(row.querySelector(".row-actions").hidden, false);
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Bearbeiten", "Löschen"]);
    assert.equal(actionButton(row, "edit").getAttribute("aria-label"), "Müll bearbeiten");
    assert.equal(actionButton(row, "delete").getAttribute("aria-label"), "Müll löschen");
  });

  test("Edit opens the dialog prefilled, without recurrence, priority or assignee", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "Müll", due: "2026-10-10T07:15:00Z" }] });
    hass.states["sensor.donetick_chores_1"].attributes.description = "auch Papier";
    card.hass = hass;
    expand(card);
    actionButton(rows(card)[0], "edit").click();

    const dialog = card._dialog;
    assert.ok(dialog);
    assert.equal(dialog.mode, "edit");
    assert.equal(card._editTaskId, 1);
    assert.equal(text(dialog.section.querySelector("h2")), "Aufgabe bearbeiten");
    assert.equal(dialog.title.value, "Müll");
    assert.equal(dialog.description.value, "auch Papier");
    const expected = new Date("2026-10-10T07:15:00Z");
    const pad = (n) => String(n).padStart(2, "0");
    assert.equal(
      dialog.due.value,
      `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}`,
    );
    assert.equal(dialog.section.contains(dialog.frequencyType), false);
    assert.equal(dialog.section.contains(dialog.priority), false);
    assert.equal(dialog.section.contains(dialog.memberBox), false);
    assert.match(text(dialog.section.querySelector(".edit-note")), /nur in Donetick selbst/);
    assert.equal(card.shadowRoot.activeElement, dialog.title);
  });

  test("saving calls update_task with task_id, name, description and due_date", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    card.hass = hass;
    expand(card);
    actionButton(rows(card)[0], "edit").click();
    const dialog = card._dialog;
    dialog.title.value = "  Müll rausbringen ";
    dialog.description.value = " bitte ";
    dialog.due.value = "2026-10-12T18:00";
    submit(env, dialog);
    assert.equal(dialog.save.disabled, true);
    assert.equal(text(dialog.save), "Speichert …");
    await flush();

    assert.equal(hass.calls.length, 1);
    assert.deepEqual(plain(hass.calls[0]), {
      domain: "donetick",
      service: "update_task",
      data: {
        task_id: 7,
        name: "Müll rausbringen",
        description: "bitte",
        config_entry_id: "CONFIG_ENTRY_1",
        due_date: new Date("2026-10-12T18:00").toISOString(),
      },
    });
    assert.equal(card._dialog, null);
    assert.equal(card._editTaskId, null);
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "„Müll rausbringen\" wurde gespeichert.");
  });

  test("an empty due date is left out, a cleared description is sent as empty", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll", due: inDays(1) }] });
    card.hass = hass;
    expand(card);
    actionButton(rows(card)[0], "edit").click();
    card._dialog.due.value = "";
    card._dialog.description.value = "";
    submit(env, card._dialog);
    await flush();
    assert.equal("due_date" in hass.calls[0].data, false);
    assert.equal(hass.calls[0].data.description, "");
  });

  test("validation: empty title, invalid date, vanished chore", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    card.hass = hass;
    expand(card);
    actionButton(rows(card)[0], "edit").click();
    const dialog = card._dialog;

    await card._updateTask({ title: "  " });
    assert.equal(text(dialog.formError), "Bitte einen Titel eingeben.");
    await card._updateTask({ title: "x", due: "irgendwann" });
    assert.equal(text(dialog.formError), "Das Fälligkeitsdatum ist ungültig.");

    card.hass = withStates(hass, { "sensor.donetick_chores_7": null });
    assert.equal(card._dialog, dialog, "the dialog is still open");
    await card._updateTask({ title: "x" });
    assert.equal(text(dialog.formError), "Die Aufgabe ist nicht mehr vorhanden.");
    assert.equal(hass.calls.length, 0);
    assert.equal(card._busyCreate, false);
  });

  test("update_task failure: error in the dialog and as a toast, input kept", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({
      tasks: [{ id: 7, name: "Müll" }],
      callService: async () => { throw new Error("nicht erlaubt"); },
    });
    card.hass = hass;
    const notifications = [];
    card.addEventListener("hass-notification", (event) => notifications.push(event.detail.message));
    expand(card);
    actionButton(rows(card)[0], "edit").click();
    const dialog = card._dialog;
    dialog.title.value = "Neu";
    submit(env, dialog);
    await flush();
    assert.equal(card._dialog, dialog);
    assert.equal(text(dialog.formError), "Aufgabe konnte nicht gespeichert werden: nicht erlaubt");
    assert.deepEqual(notifications, ["Aufgabe konnte nicht gespeichert werden: nicht erlaubt"]);
    assert.equal(dialog.save.disabled, false);
    assert.equal(dialog.title.value, "Neu");
  });

  test("cancel closes the edit dialog and returns focus to the Edit button", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    expand(card);
    const edit = actionButton(rows(card)[0], "edit");
    edit.focus();
    edit.click();
    card.shadowRoot.querySelector(".cancel").click();
    assert.equal(card._dialog, null);
    assert.equal(card._editTaskId, null);
    assert.equal(card.shadowRoot.activeElement, edit);
    // The next "+" opens a create dialog, not a leftover edit one.
    openCreate(card);
    assert.equal(card._dialog.mode, "create");
    assert.equal(card._dialog.title.value, "");
  });

  test("the edit dialog survives a language switch with its input and mode", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    card.hass = hass;
    expand(card);
    actionButton(rows(card)[0], "edit").click();
    card._dialog.title.value = "Müll neu";
    card.hass = { ...hass, locale: { language: "en" } };
    assert.equal(card._dialog.mode, "edit");
    assert.equal(text(card._dialog.section.querySelector("h2")), "Edit chore");
    assert.equal(card._dialog.title.value, "Müll neu");
    assert.match(text(card._dialog.section.querySelector(".edit-note")), /only be changed in Donetick/);
  });

  test("English texts", async () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", language: "en" });
    const hass = makeHass({ tasks: [{ id: 7, name: "Bins" }] });
    card.hass = hass;
    const row = expand(card);
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Edit", "Delete"]);
    assert.equal(actionButton(row, "edit").getAttribute("aria-label"), "Edit Bins");
    actionButton(row, "edit").click();
    submit(env, card._dialog);
    await flush();
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "“Bins” has been saved.");
  });
});

describe("Deleting a chore", () => {
  test("needs a confirmation step before anything is called", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    card.hass = hass;
    const row = expand(card);
    actionButton(row, "delete").click();
    await flush();
    assert.equal(hass.calls.length, 0, "the first tap only asks");
    assert.equal(text(row.querySelector(".confirm-text")), "Wirklich löschen?");
    assert.equal(row.querySelector(".confirm-text").getAttribute("role"), "alert");
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Ja, löschen", "Abbrechen"]);
    assert.equal(actionButton(row, "delete-confirm").getAttribute("aria-label"), "Müll löschen");

    actionButton(row, "delete-cancel").click();
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Bearbeiten", "Löschen"]);
    assert.equal(hass.calls.length, 0);
  });

  test("collapsing the row withdraws the question", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7 }] });
    const row = expand(card);
    actionButton(row, "delete").click();
    row.querySelector("button.check").click();
    assert.equal(card._confirmDeleteTaskId, null);
    row.querySelector("button.check").click();
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Bearbeiten", "Löschen"]);
  });

  test("confirming calls delete_task and holds the row until the sensor is gone", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }, { id: 8, name: "Rest" }] });
    card.hass = hass;
    const row = expand(card);
    actionButton(row, "delete").click();
    actionButton(row, "delete-confirm").click();
    await flush();

    assert.deepEqual(plain(hass.calls[0]), {
      domain: "donetick",
      service: "delete_task",
      data: { task_id: 7, config_entry_id: "CONFIG_ENTRY_1" },
    });
    assert.ok(row.classList.contains("deleted"));
    assert.ok(row.classList.contains("done"));
    assert.equal(row.querySelector("button.check").disabled, true);
    assert.equal(row.querySelector("button.check").getAttribute("aria-label"), "Müll wurde gelöscht");
    assert.equal(text(row.querySelector(".due")), "Gelöscht – warte auf Donetick …");
    assert.equal(row.querySelector(".row-actions").hidden, true);
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "„Müll\" wurde gelöscht.");
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");
    assert.ok(card._pruneTimer);

    // Neither a second deletion nor a completion gets through meanwhile.
    await card._delete(7);
    await card._complete(7, 1, null);
    assert.equal(hass.calls.length, 1);

    card.hass = withStates(hass, { "sensor.donetick_chores_7": null });
    assert.equal(card._deletedTasks.size, 0);
    assert.equal(rows(card).length, 1);
  });

  test("busy state while the call hangs, other rows unaffected", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const releases = [];
    const hass = makeHass({
      tasks: [{ id: 7, name: "eins" }, { id: 8, name: "zwei" }],
      callService: (domain, service, data) => {
        hass.calls.push({ domain, service, data });
        return new Promise((resolve) => { releases.push(resolve); });
      },
    });
    card.hass = hass;
    const row = expand(card);
    actionButton(row, "delete").click();
    actionButton(row, "delete-confirm").click();
    assert.ok(card._busyDeleteIds.has(7));
    assert.equal(text(row.querySelector(".due")), "Wird gelöscht …");
    assert.equal(row.querySelector("button.check").disabled, true);
    assert.ok(row.querySelector(".spinner"));
    assert.ok(row.querySelector(".row-actions").hidden || actionButton(row, "edit").disabled);

    const other = rows(card)[1];
    other.querySelector("button.check").click();
    other.querySelector("button.member").click();
    await flush();
    assert.equal(hass.calls.length, 2);
    assert.equal(hass.calls[1].service, "complete_chore");
    for (const release of releases) release();
    await flush();
    assert.equal(card._busyDeleteIds.size, 0);
    assert.ok(row.classList.contains("deleted"));
  });

  test("delete_task failure: message stays, row is untouched, toast sent", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({
      tasks: [{ id: 7, name: "Müll" }],
      callService: async () => { throw new Error("verboten"); },
    });
    card.hass = hass;
    const notifications = [];
    card.addEventListener("hass-notification", (event) => notifications.push(event.detail.message));
    const row = expand(card);
    actionButton(row, "delete").click();
    actionButton(row, "delete-confirm").click();
    await flush();
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "Aufgabe konnte nicht gelöscht werden: verboten");
    assert.deepEqual(notifications, ["Aufgabe konnte nicht gelöscht werden: verboten"]);
    assert.ok(!row.classList.contains("deleted"));
    assert.equal(row.querySelector("button.check").disabled, false);
    assert.equal(card._busyDeleteIds.size, 0);
    assert.equal(card._statusTimer, null, "an error does not vanish on its own");
  });

  test("a missing config_entry_id stops the call", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }], configEntryId: null });
    card.hass = hass;
    const row = expand(card);
    actionButton(row, "delete").click();
    actionButton(row, "delete-confirm").click();
    await flush();
    assert.equal(hass.calls.length, 0);
    assert.match(text(card.shadowRoot.querySelector(".status-text")), /Konfigurations-ID fehlt/);
  });

  test("a deletion that finishes after a source switch is discarded", async () => {
    const env = loadCard();
    const card = makeCard(env);
    let release;
    const hass = makeHass({
      tasks: [{ id: 7, name: "alt" }],
      extraStates: {
        "todo.other": { entity_id: "todo.other", state: "1", attributes: { circle_members: MEMBERS, config_entry_id: "C2" } },
        "sensor.other_7": { entity_id: "sensor.other_7", state: "fremd", attributes: { task_id: 7, is_active: true } },
      },
      callService: () => new Promise((resolve) => { release = resolve; }),
    });
    card.hass = hass;
    const row = expand(card);
    actionButton(row, "delete").click();
    actionButton(row, "delete-confirm").click();
    card.setConfig({ todo_entity: "todo.other", sensor_prefix: "sensor.other_" });
    release();
    await flush();
    assert.equal(card._deletedTasks.size, 0);
    assert.ok(!rows(card)[0].classList.contains("deleted"));
    assert.equal(card.shadowRoot.querySelector(".status").hidden, true);
  });

  test("the deleted state expires without a hass update", async () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    const previous = CardClass.completedTimeoutMs;
    CardClass.completedTimeoutMs = 20;
    try {
      const card = makeCard(env);
      card.hass = makeHass({ tasks: [{ id: 7 }] });
      const row = expand(card);
      actionButton(row, "delete").click();
      actionButton(row, "delete-confirm").click();
      await flush();
      assert.ok(row.classList.contains("deleted"));
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.ok(!row.classList.contains("deleted"));
      assert.equal(row.querySelector("button.check").disabled, false);
    } finally {
      CardClass.completedTimeoutMs = previous;
    }
  });

  test("English texts", async () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", language: "en" });
    card.hass = makeHass({ tasks: [{ id: 7, name: "Bins" }] });
    const row = expand(card);
    actionButton(row, "delete").click();
    assert.equal(text(row.querySelector(".confirm-text")), "Really delete?");
    assert.deepEqual([...row.querySelectorAll("button.row-action")].map(text), ["Yes, delete", "Cancel"]);
    actionButton(row, "delete-confirm").click();
    await flush();
    assert.equal(text(row.querySelector(".due")), "Deleted – waiting for Donetick …");
    assert.equal(row.querySelector("button.check").getAttribute("aria-label"), "Bins has been deleted");
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "“Bins” has been deleted.");
  });
});

// ---------------------------------------------------------------------------
// Wall tablet: compact and max_items
// ---------------------------------------------------------------------------

describe("Compact mode", () => {
  test("is off by default and toggles a class on the ha-card", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }] });
    assert.equal(card.shadowRoot.querySelector("ha-card").classList.contains("compact"), false);
    card.setConfig({ todo_entity: "todo.all_tasks", compact: true });
    assert.equal(card.shadowRoot.querySelector("ha-card").classList.contains("compact"), true);
    card.setConfig({ todo_entity: "todo.all_tasks", compact: false });
    assert.equal(card.shadowRoot.querySelector("ha-card").classList.contains("compact"), false);
  });

  test("the compact rules keep every tap target at 44 px", () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    const css = card.shadowRoot.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");
    const compactRules = css.split("\n").filter((line) => line.trimStart().startsWith("ha-card.compact"));
    assert.ok(compactRules.length >= 5, "there are compact rules");
    for (const rule of compactRules) {
      const height = /(?:min-)?height:\s*(\d+)px/.exec(rule);
      if (height) assert.ok(Number(height[1]) >= 44, `compact rule shrinks a height below 44px: ${rule.trim()}`);
      assert.doesNotMatch(rule, /\.(check|add|member|row-action|filter|more|weekday)\b/, "compact never restyles a control");
    }
  });
});

describe("max_items", () => {
  const tasks = [1, 2, 3, 4, 5].map((id) => ({ id, name: `Nr ${id}`, due: inDays(id) }));
  const more = (card) => card.shadowRoot.querySelector("button.more");

  test("without the option everything is shown and the button is hidden", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks });
    assert.equal(rows(card).length, 5);
    assert.equal(more(card).hidden, true);
  });

  test("limits the list and offers the rest behind a button", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", max_items: 2 });
    card.hass = makeHass({ tasks });
    assert.deepEqual(rows(card).map((row) => text(row.querySelector(".name"))), ["Nr 1", "Nr 2"]);
    assert.equal(more(card).hidden, false);
    assert.equal(text(more(card)), "Weitere anzeigen (3)");
    assert.equal(more(card).getAttribute("aria-expanded"), "false");
    assert.equal(text(card.shadowRoot.querySelector(".count")), "5 offen", "the counter names all open chores");

    more(card).click();
    assert.equal(rows(card).length, 5);
    assert.equal(text(more(card)), "Weniger anzeigen");
    assert.equal(more(card).getAttribute("aria-expanded"), "true");
    more(card).click();
    assert.equal(rows(card).length, 2);
  });

  test("no button when the list fits", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", max_items: 5 });
    card.hass = makeHass({ tasks });
    assert.equal(more(card).hidden, true);
  });

  test("applies after the person filter and resets on a filter change", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", max_items: 1, show_filters: true });
    card.hass = makeHass({ tasks: [{ id: 1, name: "a", assignedTo: 1 }, { id: 2, name: "b", assignedTo: 1 }, { id: 3, name: "c" }] });
    more(card).click();
    assert.equal(rows(card).length, 3);
    card.shadowRoot.querySelectorAll("button.filter")[1].click();
    assert.equal(rows(card).length, 1, "collapsed again");
    assert.equal(text(more(card)), "Weitere anzeigen (1)");
  });

  test("English button text", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", max_items: 1, language: "en" });
    card.hass = makeHass({ tasks });
    assert.equal(text(more(card)), "Show more (4)");
    more(card).click();
    assert.equal(text(more(card)), "Show less");
  });
});

// ---------------------------------------------------------------------------
// Configuration validation for the new options
// ---------------------------------------------------------------------------

describe("setConfig: new options", () => {
  const set = (config) => () => makeCard(loadCard()).setConfig(config);

  test("rejects wrong types and values", () => {
    assert.throws(set({ todo_entity: "todo.a", show_filters: "yes" }), /show_filters muss true oder false sein/);
    assert.throws(set({ todo_entity: "todo.a", group_by: "person" }), /group_by muss einer dieser Werte sein: none, due/);
    assert.throws(set({ todo_entity: "todo.a", compact: 1 }), /compact muss true oder false sein/);
    assert.throws(set({ todo_entity: "todo.a", max_items: 0 }), /max_items/);
    assert.throws(set({ todo_entity: "todo.a", max_items: "3" }), /max_items/);
    assert.throws(set({ todo_entity: "todo.a", max_items: 2.5 }), /max_items/);
  });

  test("accepts valid values", () => {
    assert.doesNotThrow(set({ todo_entity: "todo.a", show_filters: true, group_by: "due", compact: true, max_items: 3 }));
    assert.doesNotThrow(set({ todo_entity: "todo.a", show_filters: false, group_by: "none", compact: false }));
  });

  test("errors come in English when asked", () => {
    assert.throws(set({ todo_entity: "todo.a", language: "en", group_by: "x" }), /group_by must be one of: none, due/);
    assert.throws(set({ todo_entity: "todo.a", language: "en", max_items: -1 }), /max_items must be a whole number/);
  });
});
