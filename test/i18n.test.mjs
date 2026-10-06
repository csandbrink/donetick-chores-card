import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, MEMBERS } from "./helpers.mjs";
import { LOCALES, LANGUAGES, resolveLanguage, languageFromHass, translate } from "../src/i18n.js";
import de from "../src/locales/de.js";
import en from "../src/locales/en.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** ISO timestamp for "n days from now, midday local time". */
const inDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

/** A hass object that reports the given language the way the HA frontend does. */
const hassIn = (language, options = {}) => ({ ...makeHass(options), locale: { language } });

describe("Locale files", () => {
  test("de and en carry exactly the same keys", () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  });

  test("every registered language has every German key", () => {
    // Guards the languages that get added later as well as the two shipped.
    for (const language of LANGUAGES) {
      assert.deepEqual(
        Object.keys(LOCALES[language]).sort(),
        Object.keys(de).sort(),
        `${language} differs from de`,
      );
    }
  });

  test("no translation is empty or left identical to a placeholder-only template", () => {
    for (const language of LANGUAGES) {
      for (const [key, value] of Object.entries(LOCALES[language])) {
        assert.ok(typeof value === "string" && value.trim(), `${language}: ${key} is empty`);
      }
    }
  });

  test("placeholders agree between the languages", () => {
    const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(de)) {
      assert.deepEqual(placeholders(en[key]), placeholders(de[key]), `placeholders in ${key}`);
    }
  });
});

describe("translate", () => {
  test("fills placeholders and leaves unknown ones alone", () => {
    assert.equal(translate("en", "card.open_count", { count: 3 }), "3 open");
    assert.equal(translate("de", "due.on", {}), "Fällig {date}");
  });

  test("a key missing from a language falls back to German, then to the key", () => {
    const original = LOCALES.en;
    try {
      LOCALES.en = { ...original };
      delete LOCALES.en["card.empty"];
      assert.equal(translate("en", "card.empty"), de["card.empty"]);
      assert.equal(translate("en", "does.not.exist"), "does.not.exist");
    } finally {
      LOCALES.en = original;
    }
  });

  test("an unknown language reads as German", () => {
    assert.equal(translate("xx", "card.empty"), de["card.empty"]);
  });
});

describe("resolveLanguage", () => {
  test("the config option wins over Home Assistant", () => {
    assert.equal(resolveLanguage("en", { locale: { language: "de" } }), "en");
    assert.equal(resolveLanguage("de", { locale: { language: "en" } }), "de");
  });

  test("hass.locale.language is preferred, hass.language is the older fallback", () => {
    assert.equal(resolveLanguage(undefined, { locale: { language: "en" }, language: "de" }), "en");
    assert.equal(resolveLanguage(undefined, { language: "en" }), "en");
    assert.equal(languageFromHass({ language: "de-AT" }), "de");
  });

  test("only the part before the dash counts", () => {
    assert.equal(resolveLanguage(undefined, { locale: { language: "en-GB" } }), "en");
    assert.equal(resolveLanguage(undefined, { locale: { language: "de-CH" } }), "de");
    assert.equal(resolveLanguage(undefined, { locale: { language: "DE" } }), "de");
  });

  test("a language the card lacks becomes English", () => {
    assert.equal(resolveLanguage(undefined, { locale: { language: "fr" } }), "en");
    assert.equal(resolveLanguage(undefined, { language: "nl-NL" }), "en");
  });

  test("without any language information the card stays German", () => {
    assert.equal(resolveLanguage(undefined, undefined), "de");
    assert.equal(resolveLanguage(undefined, {}), "de");
    assert.equal(resolveLanguage(undefined, { locale: {} }), "de");
    assert.equal(resolveLanguage(undefined, { locale: { language: "" } }), "de");
    assert.equal(resolveLanguage(undefined, { language: 5 }), "de");
  });
});

describe("setConfig: language", () => {
  const set = (config) => () => makeCard(loadCard()).setConfig(config);

  test("rejects a language the card does not have", () => {
    assert.throws(set({ todo_entity: "todo.a", language: "fr" }), /language/);
    assert.throws(set({ todo_entity: "todo.a", language: 7 }), /language/);
    assert.throws(set({ todo_entity: "todo.a", language: "" }), /language/);
  });

  test("accepts de and en", () => {
    assert.doesNotThrow(set({ todo_entity: "todo.a", language: "de" }));
    assert.doesNotThrow(set({ todo_entity: "todo.a", language: "en" }));
  });

  test("config errors come in the configured language", () => {
    assert.throws(set({ todo_entity: "sensor.x", language: "en" }), /must be a todo entity/);
    assert.throws(set({ todo_entity: "sensor.x" }), /muss eine todo-Entität/);
    // An unusable language option cannot pick the language of its own error.
    assert.throws(set({ todo_entity: "todo.a", language: "fr" }), /muss eine dieser Sprachen sein: de, en/);
  });

  test("config errors follow Home Assistant's language once hass is known", () => {
    const card = makeCard(loadCard());
    card.hass = hassIn("en");
    assert.throws(() => card.setConfig({ todo_entity: "todo.a", title: 5 }), /must be a string/);
  });

  test("the config option overrides Home Assistant's language", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", language: "de" });
    card.hass = hassIn("en", { tasks: [{ id: 1 }] });
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");

    const other = makeCard(env, { todo_entity: "todo.all_tasks", language: "en" });
    other.hass = makeHass({ tasks: [{ id: 1 }] });
    assert.equal(text(other.shadowRoot.querySelector(".count")), "1 open");
  });
});

describe("English output", () => {
  const englishCard = (options = {}) => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = hassIn("en", options);
    card.hass = hass;
    return { env, card, hass };
  };

  test("title, counter, empty and loading state", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", language: "en" });
    assert.equal(text(card.shadowRoot.querySelector(".title")), "Chores");
    assert.equal(text(card.shadowRoot.querySelector(".loading")), "Loading chores …");

    card.hass = makeHass({ tasks: [] });
    assert.equal(text(card.shadowRoot.querySelector(".empty")), "No open chores");

    card.hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }] });
    assert.equal(text(card.shadowRoot.querySelector(".count")), "2 open");
  });

  test("getStubConfig names the card in Home Assistant's language", () => {
    const env = loadCard();
    const CardClass = env.window.customElements.get("donetick-chores-card");
    assert.equal(CardClass.getStubConfig({ states: {}, locale: { language: "en" } }).title, "Chores");
    assert.equal(CardClass.getStubConfig({ states: {} }).title, "Aufgaben");
  });

  test("due date texts", () => {
    const { card } = englishCard();
    assert.equal(card._dueText(inDays(0)), "Due today");
    assert.equal(card._dueText(inDays(1)), "Due tomorrow");
    assert.equal(card._dueText(inDays(-1)), "Due since yesterday");
    assert.equal(card._dueText(inDays(-4)), "Overdue by 4 days");
    assert.equal(card._dueText("übermorgen vielleicht"), "Invalid due date");
    assert.equal(card._dueText(null), "");
  });

  test("the date is formatted for the language", () => {
    const { card } = englishCard();
    const value = inDays(5);
    const expected = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit" }).format(new Date(value));
    assert.equal(card._dueText(value), `Due ${expected}`);
    assert.notEqual(
      expected,
      new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(value)),
      "the two locales really do format differently",
    );
  });

  test("row labels", () => {
    const { card } = englishCard({ tasks: [{ id: 1, name: "Bins", assignedTo: 2 }] });
    const check = card.shadowRoot.querySelector("button.check");
    assert.equal(check.title, "Choose who did it");
    assert.equal(check.getAttribute("aria-label"), "Choose who did Bins");
    check.click();
    assert.equal(text(card.shadowRoot.querySelector(".chooser-label")), "Done by");
    assert.equal(card.shadowRoot.querySelector(".chooser").getAttribute("aria-label"), "Done by");
    assert.equal(card.shadowRoot.querySelector("button.member").getAttribute("aria-label"), "Done by Christoph");
    assert.equal(card.shadowRoot.querySelector("button.add").getAttribute("aria-label"), "Add chore");
    assert.equal(card.shadowRoot.querySelector(".status-close").getAttribute("aria-label"), "Dismiss message");
  });

  test("booking: row state, status message", async () => {
    const { card } = englishCard({ tasks: [{ id: 7, name: "Bins" }] });
    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    const row = rows(card)[0];
    assert.equal(text(row.querySelector(".due")), "Booked – waiting for Donetick …");
    assert.equal(row.querySelector("button.check").title, "Already booked");
    assert.equal(row.querySelector("button.check").getAttribute("aria-label"), "Bins has been booked");
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "“Bins” – done by Christoph.");
    assert.equal(text(card.shadowRoot.querySelector(".count")), "0 open");
  });

  test("booking failure and missing config entry", async () => {
    const { card } = englishCard({
      tasks: [{ id: 7 }],
      callService: async () => { throw new Error("nope"); },
    });
    const notifications = [];
    card.addEventListener("hass-notification", (event) => notifications.push(event.detail.message));
    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "The chore could not be completed: nope");
    assert.deepEqual(notifications, ["The chore could not be completed: nope"]);

    const other = englishCard({ tasks: [{ id: 7 }], configEntryId: null }).card;
    other.shadowRoot.querySelector("button.check").click();
    other.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.match(text(other.shadowRoot.querySelector(".status-text")), /config entry id is missing/);
  });

  test("the dialog", async () => {
    const { env, card, hass } = englishCard({ tasks: [] });
    card.shadowRoot.querySelector("button.add").click();
    const dialog = card._dialog;

    assert.equal(text(dialog.section.querySelector("h2")), "New chore");
    assert.equal(dialog.section.querySelector(".dialog-close").getAttribute("aria-label"), "Close dialog");
    assert.deepEqual(
      [...dialog.section.querySelectorAll("label")].map((label) => label.firstChild.textContent),
      ["Title", "Description", "Due on", "Repeat", "Every", "Unit", "Priority"],
    );
    assert.equal(text(dialog.section.querySelector("fieldset:not(.weekdays) legend")), "Assigned to");
    assert.equal(text(dialog.section.querySelector(".weekdays legend")), "Weekdays");
    assert.deepEqual(
      [...dialog.frequencyType.options].map((option) => option.textContent),
      ["Once", "Daily", "Weekly", "Monthly", "Yearly", "Every N days/weeks/months/years", "Specific weekdays"],
    );
    assert.deepEqual(
      [...dialog.intervalUnit.options].map((option) => option.textContent),
      ["days", "weeks", "months", "years"],
    );
    assert.deepEqual(
      [...dialog.weekdayButtons.values()].map((button) => button.textContent),
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    );
    assert.equal(text(dialog.section.querySelector(".cancel")), "Cancel");
    assert.equal(text(dialog.save), "Save");
    assert.equal(dialog.memberBox.querySelector("button.create-member").getAttribute("aria-label"), "Select Christoph");

    dialog.title.value = "  ";
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();
    assert.equal(text(dialog.formError), "Please enter a title.");

    await card._createTask({ title: "x", due: "someday", userId: null });
    assert.equal(text(dialog.formError), "The due date is invalid.");

    await card._createTask({ title: "x", userId: 99 });
    assert.equal(text(dialog.formError), "The selected Donetick user is no longer available.");

    dialog.title.value = "Windows";
    hass.callService = async () => { throw new Error("rejected"); };
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    assert.equal(text(dialog.save), "Saving …");
    await flush();
    assert.equal(text(dialog.formError), "The chore could not be added: rejected");
  });

  test("the 'no users' notice", () => {
    const { card } = englishCard({ tasks: [], members: [] });
    card.shadowRoot.querySelector("button.add").click();
    assert.equal(text(card._dialog.formError), "No Donetick users available. Please reload the integration.");
  });

  test("a successful creation", async () => {
    const { env, card } = englishCard({ tasks: [] });
    card.shadowRoot.querySelector("button.add").click();
    card._dialog.title.value = "Windows";
    card._dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();
    assert.equal(card._dialog, null);
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "Chore added.");
  });
});

describe("Language switch at runtime", () => {
  test("a changed hass language re-renders even without a state change", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "Müll", due: inDays(0) }] });
    card.hass = hass;
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");
    assert.equal(text(rows(card)[0].querySelector(".due")), "Heute fällig");

    // Same states object, only the language differs - which _relevantChange
    // alone would dismiss.
    card.hass = { ...hass, locale: { language: "en" } };
    assert.equal(text(card.shadowRoot.querySelector(".title")), "Chores");
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 open");
    assert.equal(text(rows(card)[0].querySelector(".due")), "Due today");
    assert.equal(text(rows(card)[0].querySelector(".chooser-label")), "Done by");
    assert.equal(card.shadowRoot.querySelector("button.add").title, "Add chore");

    card.hass = { ...hass, locale: { language: "de" } };
    assert.equal(text(card.shadowRoot.querySelector(".count")), "1 offen");
    assert.equal(text(rows(card)[0].querySelector(".due")), "Heute fällig");
  });

  test("a configured title is left alone", () => {
    const env = loadCard();
    const card = makeCard(env, { todo_entity: "todo.all_tasks", title: "Haushalt" });
    card.hass = hassIn("en", { tasks: [] });
    assert.equal(text(card.shadowRoot.querySelector(".title")), "Haushalt");
  });

  test("a status message on screen is re-translated", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll" }] });
    card.hass = hass;
    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "„Müll\" – erledigt von Christoph.");

    card.hass = { ...hass, locale: { language: "en" } };
    assert.equal(text(card.shadowRoot.querySelector(".status-text")), "“Müll” – done by Christoph.");
  });

  test("an open dialog keeps its input and picks up the new labels", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    card.shadowRoot.querySelector("button.add").click();
    const before = card._dialog;
    before.title.value = "Fenster putzen";
    before.description.value = "innen";
    before.frequencyType.value = "weekly";
    before.priority.value = "3";
    before.memberBox.querySelectorAll("button.create-member")[1].click();
    before.title.focus();

    card.hass = { ...hass, locale: { language: "en" } };

    const after = card._dialog;
    assert.notEqual(after, before, "rebuilt with the new labels");
    assert.equal(card.shadowRoot.querySelectorAll(".dialog-backdrop").length, 1);
    assert.equal(text(after.section.querySelector("h2")), "New chore");
    assert.equal(after.title.value, "Fenster putzen");
    assert.equal(after.description.value, "innen");
    assert.equal(after.frequencyType.value, "weekly");
    assert.equal(after.priority.value, "3");
    assert.deepEqual(
      [...after.memberBox.querySelectorAll("button.create-member")].map((b) => b.getAttribute("aria-pressed")),
      ["false", "true", "false"],
      "the picked member survives",
    );
    assert.equal(card.shadowRoot.activeElement, after.title, "focus stays in the dialog");

    // The member list keeps following hass updates afterwards.
    card.hass = withStates({ ...hass, locale: { language: "en" } }, {
      "todo.all_tasks": { attributes: { circle_members: [MEMBERS[0]] } },
    });
    assert.equal(card._dialog, after);
    assert.equal(after.memberBox.querySelectorAll("button.create-member").length, 1);
  });

  test("the 'no users' notice is re-translated and still clears", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [], members: [] });
    card.hass = hass;
    card.shadowRoot.querySelector("button.add").click();
    assert.match(text(card._dialog.formError), /Keine Donetick-Benutzer/);

    card.hass = { ...hass, locale: { language: "en" } };
    assert.match(text(card._dialog.formError), /No Donetick users/);

    card.hass = withStates({ ...hass, locale: { language: "en" } }, {
      "todo.all_tasks": { attributes: { circle_members: MEMBERS } },
    });
    assert.equal(card._dialog.formError.hidden, true);
  });

  test("the language picked by setConfig applies to the loading state too", () => {
    const env = loadCard();
    const card = makeCard(env);
    assert.equal(text(card.shadowRoot.querySelector(".loading")), "Lade Aufgaben …");
    card.setConfig({ todo_entity: "todo.all_tasks", language: "en" });
    assert.equal(text(card.shadowRoot.querySelector(".loading")), "Loading chores …");
  });
});
