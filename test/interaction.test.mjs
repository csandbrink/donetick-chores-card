import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, plain } from "./helpers.mjs";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Completing chores", () => {
  test("tapping the circle opens the member picker", () => {
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

  test("picking a member calls complete_chore with the right fields", async () => {
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

  test("assigned_to is omitted when nobody is assigned", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    assert.equal("assigned_to" in hass.calls[0].data, false);
  });

  test("after booking: row marked, button disabled, acknowledgement shown", async () => {
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

  test("a booked chore cannot be booked a second time", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(hass.calls.length, 1);

    // Called directly: the guard in _complete has to hold even without the UI
    // disabling anything.
    await card._complete(7, 1, null);
    assert.equal(hass.calls.length, 1, "no second service call");
  });

  test("once Donetick moves the due date on, the chore is normal again", async () => {
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

  test("one chore in flight leaves the others usable", async () => {
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

    // Chore 1 is still hanging; chore 2 has to work regardless.
    rows(card)[1].querySelector("button.check").click();
    rows(card)[1].querySelector("button.member").click();
    await flush();
    assert.equal(hass.calls.length, 2);
    assert.equal(hass.calls[1].data.chore_id, 2);

    release();
  });

  test("booking failure: message on the card and as an HA notification", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({
      tasks: [{ id: 7 }],
      callService: async () => { throw new Error("Donetick is not responding"); },
    });
    card.hass = hass;

    const notifications = [];
    card.addEventListener("hass-notification", (event) => notifications.push(event));

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();

    assert.match(text(card.shadowRoot.querySelector(".status")), /Donetick is not responding/);
    assert.equal(notifications.length, 1);
    assert.ok(notifications[0] instanceof env.window.CustomEvent, "CustomEvent, not Event");
    assert.match(notifications[0].detail.message, /Donetick is not responding/);
    // After a failure the chore must not count as booked.
    assert.ok(!rows(card)[0].classList.contains("done"));
  });

  test("a missing config_entry_id stops the service call", async () => {
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

  test("sits outside the ha-card", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    open(card);

    assert.equal(card.shadowRoot.querySelector("ha-card .dialog-backdrop"), null,
      "not inside the ha-card, which carries overflow: hidden");
    assert.ok(card.shadowRoot.querySelector(".dialog-host .dialog-backdrop"));
  });

  test("opens with focus in the title field and hands it back on close", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });

    const add = card.shadowRoot.querySelector("button.add");
    add.focus();
    const dialog = open(card);
    assert.equal(card.shadowRoot.activeElement, dialog.title);

    card.shadowRoot.querySelector(".cancel").click();
    assert.equal(card.shadowRoot.querySelector(".dialog-backdrop"), null);
    assert.equal(card.shadowRoot.activeElement, add, "focus back on the trigger");
  });

  test("Escape closes it", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);

    dialog.title.dispatchEvent(new env.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(card.shadowRoot.querySelector(".dialog-backdrop"), null);
  });

  test("Tab stays trapped inside", () => {
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
    assert.equal(card.shadowRoot.activeElement, first, "from the last field to the first");

    const backward = new env.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(backward);
    assert.equal(backward.defaultPrevented, true);
    assert.equal(card.shadowRoot.activeElement, last, "and back again");
  });

  test("typed input survives a data update", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "Half typed";
    dialog.description.value = "and described";

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    assert.equal(card._dialog, dialog, "the same dialog, not rebuilt");
    assert.equal(dialog.title.value, "Half typed");
    assert.equal(dialog.description.value, "and described");
  });

  test("saving sends create_chore with the expected fields", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [] });
    card.hass = hass;
    const dialog = open(card);

    dialog.title.value = "  Fenster putzen  ";
    dialog.description.value = "  and inside too  ";
    dialog.frequencyType.value = "weekly";
    dialog.priority.value = "3";
    dialog.memberBox.querySelectorAll("button.create-member")[1].click();
    dialog.section.querySelector("form").dispatchEvent(new env.window.Event("submit", { cancelable: true }));
    await flush();

    assert.equal(hass.calls.length, 1);
    const { data } = hass.calls[0];
    assert.equal(hass.calls[0].service, "create_chore");
    assert.equal(data.name, "Fenster putzen");
    assert.equal(data.description, "and inside too");
    assert.equal(data.frequency_type, "weekly");
    assert.equal(data.frequency, 1, "repeat interval for recurring chores");
    assert.equal(data.priority, 3);
    assert.equal(data.assign_strategy, "keep_last_assigned");
    assert.deepEqual(plain(data.assignee_ids), [2]);
    assert.equal(data.assigned_to, 2);
    assert.equal(card._dialog, null, "dialog closed after success");
    assert.match(text(card.shadowRoot.querySelector(".status")), /hinzugefügt/);
  });

  test("no repeat interval is sent for a one-off chore", async () => {
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

  test("offers monthly and yearly as well", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    const dialog = open(card);
    assert.deepEqual(
      [...dialog.frequencyType.options].map((option) => option.value),
      ["once", "daily", "weekly", "monthly", "yearly"],
    );
  });

  test("empty title: an error message instead of a service call", async () => {
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
    assert.ok(card._dialog, "the dialog stays open");
  });

  test("the member picker sets aria-pressed from the start", () => {
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

describe("Status message", () => {
  const cardClass = (env) => env.window.customElements.get("donetick-chores-card");
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  test("a success message clears itself", async () => {
    const env = loadCard();
    cardClass(env).statusTimeoutMs = 20;
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7 }] });

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(card.shadowRoot.querySelector(".status").hidden, false);

    await wait(50);
    assert.equal(card.shadowRoot.querySelector(".status").hidden, true);
  });

  test("an error message stays", async () => {
    const env = loadCard();
    cardClass(env).statusTimeoutMs = 20;
    const card = makeCard(env);
    card.hass = makeHass({
      tasks: [{ id: 7 }],
      callService: async () => { throw new Error("kaputt"); },
    });

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    await wait(50);

    assert.equal(card.shadowRoot.querySelector(".status").hidden, false,
      "an error must not vanish unnoticed");
  });

  test("can be dismissed by hand", async () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7 }] });

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.equal(card.shadowRoot.querySelector(".status").hidden, false);

    card.shadowRoot.querySelector(".status-close").click();
    assert.equal(card.shadowRoot.querySelector(".status").hidden, true);
  });

  test("the timer stops when the card leaves the dashboard", async () => {
    const env = loadCard();
    cardClass(env).statusTimeoutMs = 20;
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7 }] });

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await flush();
    assert.ok(card._statusTimer);

    card.remove();
    assert.equal(card._statusTimer, null, "no timer left firing into nothing");
  });
});
