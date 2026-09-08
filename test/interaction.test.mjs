import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, plain } from "./helpers.mjs";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Erledigen", () => {
  test("Klick auf den Kreis klappt die Personenauswahl auf", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }] });

    const check = card.shadowRoot.querySelector("button.check");
    assert.equal(check.getAttribute("aria-expanded"), "false");
    assert.equal(card.shadowRoot.querySelector(".chooser").hidden, true);

    check.click();
    assert.equal(check.getAttribute("aria-expanded"), "true");
    assert.equal(card.shadowRoot.querySelector(".chooser").hidden, false);
    assert.equal(card.shadowRoot.querySelectorAll("button.member").length, 3);

    check.click();
    assert.equal(check.getAttribute("aria-expanded"), "false");
  });

  test("Auswahl einer Person ruft complete_chore mit den richtigen Feldern", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, assignedTo: 2 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelectorAll("button.member")[2].click();
    await flush();

    assert.equal(hass.calls.length, 1);
    assert.deepEqual(plain(hass.calls[0]), {
      domain: "donetick",
      service: "complete_chore",
      data: { chore_id: 7, completed_by: 3, config_entry_id: "CONFIG_ENTRY_1", assigned_to: 2 },
    });
  });

  test("ohne Zuweisung wird assigned_to weggelassen", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    assert.equal("assigned_to" in hass.calls[0].data, false);
  });

  test("nach der Buchung: Zeile markiert, Button gesperrt, Rückmeldung sichtbar", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, name: "Müll", due: "2026-09-10T10:00:00Z" }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    const row = rows(card)[0];
    assert.ok(row.classList.contains("done"));
    assert.equal(row.querySelector("button.check").disabled, true);
    assert.equal(text(row.querySelector(".due")), "Gebucht – warte auf Donetick …");
    assert.match(text(card.shadowRoot.querySelector(".status")), /Müll.*Christoph/);
    assert.equal(text(card.shadowRoot.querySelector(".count")), "0 offen");
  });

  test("eine gebuchte Aufgabe lässt sich nicht ein zweites Mal buchen", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(hass.calls.length, 1);

    // Direkt: der Guard in _complete muss auch ohne UI-Sperre greifen.
    await card._complete(7, 1, null);
    assert.equal(hass.calls.length, 1, "kein zweiter Service-Aufruf");
  });

  test("sobald Donetick den Termin fortschreibt, ist die Aufgabe wieder normal", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7, due: "2026-09-10T10:00:00Z" }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.ok(rows(card)[0].classList.contains("done"));

    card.hass = withStates(hass, {
      "sensor.donetick_chores_7": { attributes: { next_due_date: "2026-09-11T10:00:00Z" } },
    });
    assert.ok(!rows(card)[0].classList.contains("done"));
    assert.equal(rows(card)[0].querySelector("button.check").disabled, false);
  });

  test("während eine Aufgabe läuft, bleibt eine andere bedienbar", async () => {
    const env = loadCard();
    const card = makeCard(env);
    let release;
    const hass = makeHass({
      tasks: [{ id: 1, name: "eins" }, { id: 2, name: "zwei" }],
      callService: (domain, service, data) => {
        hass.calls.push({ domain, service, data });
        return new Promise((resolve) => { release = resolve; });
      },
    });
    card.hass = hass;

    rows(card)[0].querySelector("button.check").click();
    rows(card)[0].querySelector("button.member").click();
    assert.equal(hass.calls.length, 1);

    // Aufgabe 1 haengt noch: Aufgabe 2 muss trotzdem gehen.
    rows(card)[1].querySelector("button.check").click();
    rows(card)[1].querySelector("button.member").click();
    await flush();
    assert.equal(hass.calls.length, 2);
    assert.equal(hass.calls[1].data.chore_id, 2);

    release();
  });

  test("Fehler beim Buchen: Meldung in der Karte und als HA-Benachrichtigung", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({
      tasks: [{ id: 7 }],
      callService: async () => { throw new Error("Donetick antwortet nicht"); },
    });
    card.hass = hass;

    const notifications = [];
    card.addEventListener("hass-notification", (event) => notifications.push(event));

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    assert.match(text(card.shadowRoot.querySelector(".status")), /Donetick antwortet nicht/);
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0] instanceof env.window.CustomEvent, "CustomEvent, nicht Event");
    assert.match(notifications[0].detail.message, /Donetick antwortet nicht/);
    // Nach einem Fehler darf die Aufgabe nicht als gebucht gelten.
    assert.ok(!rows(card)[0].classList.contains("done"));
  });

  test("fehlende config_entry_id verhindert den Service-Aufruf", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }], configEntryId: null });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    assert.equal(hass.calls.length, 0);
    assert.match(text(card.shadowRoot.querySelector(".status")), /Konfigurations-ID fehlt/);
  });
});

describe("Dialog", () => {
  const open = (card) => {
    card.shadowRoot.querySelector("button.add").click();
    return card._dialog;
  };

  test("liegt außerhalb der ha-card", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    open(card);

    assert.equal(card.shadowRoot.querySelector("ha-card .dialog-backdrop"), null,
      "nicht innerhalb der ha-card, die overflow:hidden trägt");
    assert.ok(card.shadowRoot.querySelector(".dialog-host .dialog-backdrop"));
  });

  test("öffnet mit Fokus im Titelfeld und gibt den Fokus beim Schließen zurück", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });

    const add = card.shadowRoot.querySelector("button.add");
    add.focus();
    const dialog = open(card);
    assert.equal(card.shadowRoot.activeElement, dialog.title);

    card.shadowRoot.querySelector(".cancel").click();
    assert.equal(card.shadowRoot.querySelector(".dialog-backdrop"), null);
    assert.equal(card.shadowRoot.activeElement, add, "Fokus zurück auf den Auslöser");
  });

  test("Escape schließt", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);

    dialog.title.dispatchEvent(new env.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(card.shadowRoot.querySelector(".dialog-backdrop"), null);
  });

  test("Tab bleibt im Dialog gefangen", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);

    const focusable = [...dialog.section.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    const forward = new env.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(forward);
    assert.equal(forward.defaultPrevented, true);
    assert.equal(card.shadowRoot.activeElement, first, "vom letzten zum ersten Feld");

    const backward = new env.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(backward);
    assert.equal(backward.defaultPrevented, true);
    assert.equal(card.shadowRoot.activeElement, last, "und zurück");
  });

  test("Eingaben überleben ein Datenupdate", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "Halb getippt";
    dialog.description.value = "und beschrieben";

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    assert.equal(card._dialog, dialog, "derselbe Dialog, nicht neu gebaut");
    assert.equal(dialog.title.value, "Halb getippt");
    assert.equal(dialog.description.value, "und beschrieben");
  });

  test("Speichern schickt create_chore mit den erwarteten Feldern", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "  Fenster putzen  ";
    dialog.description.value = "  auch innen  ";
    dialog.frequencyType.value = "weekly";
    dialog.priority.value = "3";
    dialog.memberBox.querySelectorAll("button.create-member")[1].click();
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();

    assert.equal(hass.calls.length, 1);
    const { data } = hass.calls[0];
    assert.equal(hass.calls[0].service, "create_chore");
    assert.equal(data.name, "Fenster putzen");
    assert.equal(data.description, "auch innen");
    assert.equal(data.frequency_type, "weekly");
    assert.equal(data.frequency, 1, "Wiederholungsabstand bei wiederkehrenden Aufgaben");
    assert.equal(data.priority, 3);
    assert.equal(data.assign_strategy, "keep_last_assigned");
    assert.deepEqual(plain(data.assignee_ids), [2]);
    assert.equal(data.assigned_to, 2);
    assert.equal(card._dialog, null, "Dialog nach Erfolg geschlossen");
    assert.match(text(card.shadowRoot.querySelector(".status")), /hinzugefügt/);
  });

  test("bei 'einmalig' wird kein Wiederholungsabstand geschickt", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "Einmalige Sache";
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();

    assert.equal(hass.calls[0].data.frequency_type, "once");
    assert.equal("frequency" in hass.calls[0].data, false);
    assert.equal(hass.calls[0].data.assign_strategy, "no_assignee");
  });

  test("bietet auch monatlich und jährlich an", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);
    assert.deepEqual(
      [...dialog.frequencyType.options].map((option) => option.value),
      ["once", "daily", "weekly", "monthly", "yearly"],
    );
  });

  test("leerer Titel: Fehlermeldung statt Service-Aufruf", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "   ";
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();

    assert.equal(hass.calls.length, 0);
    assert.equal(dialog.formError.hidden, false);
    assert.match(text(dialog.formError), /Titel/);
    assert.ok(card._dialog, "Dialog bleibt offen");
  });

  test("Personenauswahl setzt aria-pressed von Anfang an", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);

    const buttons = [...dialog.memberBox.querySelectorAll("button.create-member")];
    assert.deepEqual(buttons.map((b) => b.getAttribute("aria-pressed")), ["false", "false", "false"]);

    buttons[1].click();
    assert.deepEqual(buttons.map((b) => b.getAttribute("aria-pressed")), ["false", "true", "false"]);
  });
});
