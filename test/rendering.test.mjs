import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, MEMBERS } from "./helpers.mjs";

describe("Rendering", () => {
  test("zeigt Aufgaben mit Name und Fälligkeit", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: "Müll rausbringen" }] });

    const list = rows(card);
    assert.equal(list.length, 1);
    assert.equal(text(list[0].querySelector(".name")), "Müll rausbringen");
    assert.equal(text(list[0].querySelector(".due")), "Ohne Termin");
  });

  test("Aufgabenname wird als Text gesetzt, nicht als Markup", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: '<img src=x onerror="alert(1)">' }] });

    const name = card.shadowRoot.querySelector(".name");
    assert.equal(name.querySelector("img"), null, "kein Element aus dem Namen entstanden");
    assert.equal(name.textContent, '<img src=x onerror="alert(1)">');
  });

  test("Mitgliedsname wird als Text gesetzt, nicht als Markup", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({
      tasks: [{ id: 1, name: "A" }],
      members: [{ user_id: 1, display_name: "<b>Chef</b>" }],
    });
    card.shadowRoot.querySelector("button.check").click();

    const member = card.shadowRoot.querySelector("button.member");
    assert.equal(member.querySelector("b"), null);
    assert.equal(member.title, "<b>Chef</b>");
  });

  test("leerer Zustand", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    assert.equal(text(card.shadowRoot.querySelector(".empty")), "Keine offenen Aufgaben");
  });

  test("Ladezustand ohne hass", () => {
    const env = loadCard();
    const card = makeCard(env);
    assert.equal(text(card.shadowRoot.querySelector(".loading")), "Lade Aufgaben …");
  });

  test("Zähler nennt die Zahl offener Aufgaben", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.equal(text(card.shadowRoot.querySelector(".count")), "3 offen");
  });

  test("Titel kommt aus der Config, Standard ist 'Aufgaben'", () => {
    const env = loadCard();
    const a = makeCard(env);
    assert.equal(text(a.shadowRoot.querySelector(".title")), "Aufgaben");

    const b = makeCard(env, { todo_entity: "todo.all_tasks", title: "Haushalt" });
    assert.equal(text(b.shadowRoot.querySelector(".title")), "Haushalt");
  });

  test("überfällige Aufgabe wird markiert, künftige nicht", () => {
    const env = loadCard();
    const card = makeCard(env);
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    card.hass = makeHass({ tasks: [{ id: 1, due: past }, { id: 2, due: future }] });

    const list = rows(card);
    assert.ok(list[0].querySelector(".due").classList.contains("overdue"));
    assert.ok(!list[1].querySelector(".due").classList.contains("overdue"));
  });

  test("sortiert nach Fälligkeit, Aufgaben ohne Termin zuletzt", () => {
    const env = loadCard();
    const card = makeCard(env);
    const soon = new Date(Date.now() + 86400000).toISOString();
    const later = new Date(Date.now() + 5 * 86400000).toISOString();
    card.hass = makeHass({
      tasks: [
        { id: 1, name: "ohne Termin" },
        { id: 2, name: "spät", due: later },
        { id: 3, name: "früh", due: soon },
      ],
    });
    assert.deepEqual(
      rows(card).map((row) => text(row.querySelector(".name"))),
      ["früh", "spät", "ohne Termin"],
    );
  });

  test("zeigt die Initiale der zugewiesenen Person", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, assignedTo: 2 }] });
    assert.equal(text(card.shadowRoot.querySelector(".assignee-initial")), "I");
  });

  test("inaktive Aufgaben und Sensoren ohne task_id werden ausgeblendet", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "aktiv" }, { id: 2, name: "inaktiv", isActive: false }] });
    hass.states["sensor.donetick_chores_ohne"] = {
      entity_id: "sensor.donetick_chores_ohne",
      state: "kaputt",
      attributes: {},
    };
    card.hass = hass;
    assert.deepEqual(rows(card).map((row) => text(row.querySelector(".name"))), ["aktiv"]);
  });

  test("fremde Entities werden nicht als Aufgaben gelesen", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({
      tasks: [{ id: 1, name: "echt" }],
      extraStates: {
        "sensor.stromverbrauch": { entity_id: "sensor.stromverbrauch", state: "42", attributes: { task_id: 9 } },
      },
    });
    assert.deepEqual(rows(card).map((row) => text(row.querySelector(".name"))), ["echt"]);
  });
});

describe("Stylesheet", () => {
  test("Fallback-Pfad hängt genau ein <style> ein, auch nach vielen Renders", () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    for (let i = 0; i < 5; i += 1) {
      card.hass = makeHass({ tasks: [{ id: 1, name: `Stand ${i}` }] });
    }
    assert.equal(card.shadowRoot.querySelectorAll("style").length, 1);
  });

  test("moderner Pfad nutzt adoptedStyleSheets und kein <style>", () => {
    const env = loadCard({ adoptedStyleSheets: true });
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }] });
    assert.equal(card.shadowRoot.querySelectorAll("style").length, 0);
    assert.equal(card.shadowRoot.adoptedStyleSheets.length, 1);
  });

  test("mehrere Karten teilen sich dasselbe Stylesheet-Objekt", () => {
    const env = loadCard({ adoptedStyleSheets: true });
    const a = makeCard(env);
    const b = makeCard(env);
    a.hass = makeHass({ tasks: [] });
    b.hass = makeHass({ tasks: [] });
    assert.equal(a.shadowRoot.adoptedStyleSheets[0], b.shadowRoot.adoptedStyleSheets[0]);
  });
});

describe("DOM-Stabilität", () => {
  test("unveränderte Daten lassen die Zeilen-Knoten unangetastet", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }] });
    card.hass = hass;
    const before = rows(card);

    // gleiche Referenzen -> _relevantChange muss abwinken
    card.hass = { ...hass, states: { ...hass.states } };
    assert.deepEqual(rows(card), before);
  });

  test("Textänderung an einer Aufgabe erhält den Zeilen-Knoten", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;
    const before = rows(card)[0];

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    const after = rows(card)[0];
    assert.equal(after, before, "derselbe Knoten wurde weiterverwendet");
    assert.equal(text(after.querySelector(".name")), "neu");
  });

  test("Fokus überlebt ein Datenupdate", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;

    const check = card.shadowRoot.querySelector("button.check");
    check.focus();
    assert.equal(card.shadowRoot.activeElement, check);

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    assert.equal(card.shadowRoot.activeElement, check, "Fokus blieb auf dem Button");
  });

  test("entfernte Aufgabe verschwindet, verbleibende behalten ihren Knoten", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "eins" }, { id: 2, name: "zwei" }] });
    card.hass = hass;
    const keep = rows(card)[0];

    card.hass = withStates(hass, { "sensor.donetick_chores_2": null });
    const after = rows(card);
    assert.equal(after.length, 1);
    assert.equal(after[0], keep);
  });
});

describe("Stylesheet-Regeln", () => {
  // Kommentare fliegen raus: sie enthalten Begriffe wie ":hover", die die
  // Prüfungen unten sonst falsch anschlagen lassen.
  const css = () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    return card.shadowRoot.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");
  };

  const ruleFor = (text, selector) =>
    text.split("\n").find((line) => line.trimStart().startsWith(`${selector} {`));

  test("Touch-Ziele sind mindestens 44 px hoch", () => {
    const text = css();
    for (const selector of [".add", ".check", ".member", ".create-member"]) {
      const rule = ruleFor(text, selector);
      assert.ok(rule, `Regel für ${selector} gefunden`);
      const height = /height:\s*(\d+)px/.exec(rule);
      assert.ok(height, `${selector} hat eine feste Höhe`);
      assert.ok(Number(height[1]) >= 44, `${selector} ist ${height[1]}px, erwartet >= 44px`);
    }
  });

  test("Hover-Regeln stehen ausschließlich im hover-Media-Query", () => {
    const text = css();
    const marker = text.indexOf("@media (hover: hover)");
    assert.ok(marker > -1, "hover-Media-Query vorhanden");
    assert.equal(
      /:hover/.test(text.slice(0, marker)),
      false,
      "kein :hover außerhalb – sonst klebt der Zustand auf Touch-Geräten",
    );
    assert.ok(/:hover/.test(text.slice(marker)));
  });

  test("jede color-mix-Deklaration hat einen einfachen Fallback davor", () => {
    const lines = css().split("\n").filter((line) => line.includes("color-mix") && line.includes("{"));
    assert.ok(lines.length > 0, "es gibt color-mix-Regeln zu prüfen");

    for (const line of lines) {
      const body = line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
      const declarations = body
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => [entry.slice(0, entry.indexOf(":")).trim(), entry.slice(entry.indexOf(":") + 1).trim()]);

      declarations.forEach(([property, value], index) => {
        if (!value.includes("color-mix")) return;
        const hasFallback = declarations
          .slice(0, index)
          .some(([earlier, earlierValue]) => earlier === property && !earlierValue.includes("color-mix"));
        assert.ok(hasFallback, `${property} ohne Fallback in: ${line.trim()}`);
      });
    }
  });
});
