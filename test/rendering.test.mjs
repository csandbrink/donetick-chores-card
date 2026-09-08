import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadCard, makeCard, makeHass, withStates, rows, text, MEMBERS } from "./helpers.mjs";

describe("Rendering", () => {
  test("shows chores with name and due date", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: "Müll rausbringen" }] });

    const list = rows(card);
    assert.equal(list.length, 1);
    assert.equal(text(list[0].querySelector(".name")), "Müll rausbringen");
  });

  test("a chore name is set as text, not as markup", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: '<img src=x onerror="alert(1)">' }] });

    const name = card.shadowRoot.querySelector(".name");
    assert.equal(name.querySelector("img"), null, "kein Element aus dem Namen entstanden");
    assert.equal(name.textContent, '<img src=x onerror="alert(1)">');
  });

  test("a member name is set as text, not as markup", () => {
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

  test("empty state", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [] });
    assert.equal(text(card.shadowRoot.querySelector(".empty")), "Keine offenen Aufgaben");
  });

  test("loading state before hass arrives", () => {
    const env = loadCard();
    const card = makeCard(env);
    assert.equal(text(card.shadowRoot.querySelector(".loading")), "Lade Aufgaben …");
  });

  test("the counter names the number of open chores", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    assert.equal(text(card.shadowRoot.querySelector(".count")), "3 offen");
  });

  test("the title comes from the config, defaulting to 'Aufgaben'", () => {
    const env = loadCard();
    const a = makeCard(env);
    assert.equal(text(a.shadowRoot.querySelector(".title")), "Aufgaben");

    const b = makeCard(env, { todo_entity: "todo.all_tasks", title: "Haushalt" });
    assert.equal(text(b.shadowRoot.querySelector(".title")), "Haushalt");
  });

  test("an overdue chore is marked, a future one is not", () => {
    const env = loadCard();
    const card = makeCard(env);
    const past = new Date(Date.now() - 3 * 86400000).toISOString();
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    card.hass = makeHass({ tasks: [{ id: 1, due: past }, { id: 2, due: future }] });

    const list = rows(card);
    assert.ok(list[0].querySelector(".due").classList.contains("overdue"));
    assert.ok(!list[1].querySelector(".due").classList.contains("overdue"));
  });

  test("sorted by due date, chores without one last", () => {
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

  test("shows the initial of the assigned member", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, assignedTo: 2 }] });
    assert.equal(text(card.shadowRoot.querySelector(".assignee-initial")), "I");
  });

  test("inactive chores and sensors without a task_id are hidden", () => {
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

  test("unrelated entities are not read as chores", () => {
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
  test("the fallback path adds exactly one <style>, even after many renders", () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    for (let i = 0; i < 5; i += 1) {
      card.hass = makeHass({ tasks: [{ id: 1, name: `Stand ${i}` }] });
    }
    assert.equal(card.shadowRoot.querySelectorAll("style").length, 1);
  });

  test("the modern path uses adoptedStyleSheets and no <style>", () => {
    const env = loadCard({ adoptedStyleSheets: true });
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }] });
    assert.equal(card.shadowRoot.querySelectorAll("style").length, 0);
    assert.equal(card.shadowRoot.adoptedStyleSheets.length, 1);
  });

  test("several cards share one stylesheet object", () => {
    const env = loadCard({ adoptedStyleSheets: true });
    const a = makeCard(env);
    const b = makeCard(env);
    a.hass = makeHass({ tasks: [] });
    b.hass = makeHass({ tasks: [] });
    assert.equal(a.shadowRoot.adoptedStyleSheets[0], b.shadowRoot.adoptedStyleSheets[0]);
  });
});

describe("DOM stability", () => {
  test("unchanged data leaves the row nodes alone", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1 }, { id: 2 }] });
    card.hass = hass;
    const before = rows(card);

    // Same references, so _relevantChange has to wave this through.
    card.hass = { ...hass, states: { ...hass.states } };
    assert.deepEqual(rows(card), before);
  });

  test("a text change keeps the row node", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;
    const before = rows(card)[0];

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    const after = rows(card)[0];
    assert.equal(after, before, "the same node was reused");
    assert.equal(text(after.querySelector(".name")), "neu");
  });

  test("focus survives a data update", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, name: "alt" }] });
    card.hass = hass;

    const check = card.shadowRoot.querySelector("button.check");
    check.focus();
    assert.equal(card.shadowRoot.activeElement, check);

    card.hass = withStates(hass, { "sensor.donetick_chores_1": { state: "neu" } });
    assert.equal(card.shadowRoot.activeElement, check, "focus stayed on the button");
  });

  test("a removed chore disappears, the rest keep their nodes", () => {
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

describe("Stylesheet rules", () => {
  // Strip comments first: they contain terms like ":hover" that would
  // otherwise trip the checks below.
  const css = () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    return card.shadowRoot.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");
  };

  const ruleFor = (text, selector) =>
    text.split("\n").find((line) => line.trimStart().startsWith(`${selector} {`));

  // The drawn circle and the tap target are deliberately different sizes: the
  // circles stay small because a row of five reads better that way, and the
  // tap target is widened with a transparent ::after. So measure what a finger
  // actually hits — height plus borders plus the pseudo-element's overhang.
  const hitArea = (text, selector) => {
    const rule = ruleFor(text, selector);
    assert.ok(rule, `rule for ${selector} found`);
    const height = /height:\s*(\d+)px/.exec(rule);
    assert.ok(height, `${selector} has a fixed height`);
    const border = /border:\s*(\d+)px/.exec(rule);
    const after = text.split("\n").filter((line) => line.includes(`${selector}::after`)).pop();
    const inset = after ? /inset:\s*(-?\d+)px/.exec(after) : null;
    return Number(height[1]) + 2 * Number(border?.[1] ?? 0) + 2 * Math.abs(Number(inset?.[1] ?? 0));
  };

  test("every control offers a tap target of at least 44 px", () => {
    const text = css();
    for (const selector of [".add", ".check", ".member", ".create-member"]) {
      const size = hitArea(text, selector);
      assert.ok(size >= 44, `${selector} offers ${size}px, expected >= 44px`);
    }
  });

  test("the member circles stay visually small", () => {
    const text = css();
    // Regression guard for a deliberate design choice: growing these to fill
    // the tap target made the row of five look clumsy.
    assert.match(ruleFor(text, ".member"), /width:\s*34px/);
    assert.match(ruleFor(text, ".create-member"), /height:\s*38px/);
  });

  test("the chooser row lines up with the circle above it, not the task name", () => {
    const text = css();
    const check = ruleFor(text, ".check");
    const chooser = ruleFor(text, ".chooser");
    const buttonWidth = Number(/width:\s*(\d+)px/.exec(check)[1]);
    // --icon-box is the single place the icon size is written down; the badge
    // and the icon element both derive from it.
    const iconSize = Number(/--icon-box:\s*(\d+)px/.exec(check)[1]);
    // The button is wider than the circle drawn inside it, and that circle is
    // centred - so the circle starts half the difference in.
    const circleStartsAt = (buttonWidth - iconSize) / 2;

    const padding = /padding:\s*([^;]+);/.exec(chooser)[1].trim().split(/\s+/);
    assert.equal(padding.length, 4, "four-value padding shorthand");
    const indent = Number(padding[3].replace("px", ""));

    assert.ok(
      Math.abs(indent - circleStartsAt) <= 1,
      `chooser is indented ${indent}px but the circle starts at ${circleStartsAt}px`,
    );
  });

  test("the narrow-screen rules do not reintroduce an indent", () => {
    const text = css();
    const media = text.slice(text.indexOf("@media (max-width: 420px)"));
    assert.equal(
      /\.chooser\s*{[^}]*padding/.test(media),
      false,
      "a padding override here would undo the alignment on the tablet",
    );
  });

  test("hover rules live only inside the hover media query", () => {
    const text = css();
    const marker = text.indexOf("@media (hover: hover)");
    assert.ok(marker > -1, "hover media query present");
    assert.equal(
      /:hover/.test(text.slice(0, marker)),
      false,
      "no :hover outside - it would stick on touch devices",
    );
    assert.ok(/:hover/.test(text.slice(marker)));
  });

  test("every color-mix declaration has a plain fallback ahead of it", () => {
    const lines = css().split("\n").filter((line) => line.includes("color-mix") && line.includes("{"));
    assert.ok(lines.length > 0, "there are color-mix rules to check");

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

describe("Configuration changes", () => {
  test("switching data source discards the old state", async () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 7 }] });
    card.hass = hass;

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(card._completedTasks.size, 1);

    card.setConfig({ todo_entity: "todo.andere_liste" });
    assert.equal(card._completedTasks.size, 0, "booked task_ids from the old source");
    assert.equal(card._expandedTaskId, null);
    assert.equal(card._busyTaskIds.size, 0);
  });

  test("same source, new title only: state is kept", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 7 }] });
    card.shadowRoot.querySelector("button.check").click();
    assert.equal(card._expandedTaskId, 7);

    card.setConfig({ todo_entity: "todo.all_tasks", title: "Neuer Titel" });
    assert.equal(card._expandedTaskId, 7, "no reason to throw the selection away");
    assert.equal(text(card.shadowRoot.querySelector(".title")), "Neuer Titel");
  });

  test("the add button is disabled until data arrives", () => {
    const env = loadCard();
    const card = makeCard(env);
    assert.equal(card.shadowRoot.querySelector("button.add").disabled, true);

    card.hass = makeHass({ tasks: [] });
    assert.equal(card.shadowRoot.querySelector("button.add").disabled, false);
  });

  test("setConfig without todo_entity throws", () => {
    const env = loadCard();
    const card = env.document.createElement("donetick-chores-card");
    assert.throws(() => card.setConfig({}), /todo_entity/);
    assert.throws(() => card.setConfig(null), /todo_entity/);
  });
});

describe("Hiding elements", () => {
  // Regression guard. .status was switched to display: flex to line up its text
  // and dismiss button, which silently beat the hidden attribute: an empty
  // green box then sat above the list permanently. Any class the card hides
  // needs its own [hidden] override, so check them all rather than that one.
  //
  // This checks the rule rather than the rendered result on purpose: jsdom does
  // not cascade shadow-root styles, so getComputedStyle would report "none"
  // here whether or not the override exists, and would have passed while the
  // bug was live.
  const HIDDEN_CLASSES = ["status", "chooser", "form-error"];

  const stylesheet = () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    return card.shadowRoot.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");
  };

  test("every hidden class that sets display also overrides it", () => {
    const css = stylesheet();
    let checked = 0;
    for (const name of HIDDEN_CLASSES) {
      const base = css.split("\n").find((line) => line.trimStart().startsWith(`.${name} {`));
      assert.ok(base, `.${name} has a rule`);
      if (!/(^|;|{)\s*display:/.test(base)) continue;
      checked += 1;
      assert.ok(
        css.includes(`.${name}[hidden] { display: none; }`),
        `.${name} sets display but has no [hidden] override`,
      );
    }
    assert.ok(checked >= 2, "at least the two flex containers were actually examined");
  });

  test("the status bar carries the hidden attribute until there is something to say", async () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1 }] });
    assert.equal(card.shadowRoot.querySelector(".status").hidden, true);

    card.shadowRoot.querySelector("button.check").click();
    card.shadowRoot.querySelector("button.member").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(card.shadowRoot.querySelector(".status").hidden, false);
  });
});

describe("The circle in front of a chore", () => {
  const css = () => {
    const env = loadCard({ adoptedStyleSheets: false });
    const card = makeCard(env);
    return card.shadowRoot.querySelector("style").textContent.replace(/\/\*[\s\S]*?\*\//g, "");
  };
  const ruleFor = (text, selector) =>
    text.split("\n").find((line) => line.trimStart().startsWith(`${selector} {`));

  // The rendered diameters are verified in a browser, not here — jsdom does no
  // layout and cannot resolve calc() against a custom property. What is checked
  // here are the two properties whose absence caused assigned chores to show a
  // visibly larger circle than unassigned ones.
  test("the assignee badge is measured from its border, not inside it", () => {
    const rule = ruleFor(css(), ".assignee-initial");
    assert.ok(rule, "there is a rule for the badge");
    assert.match(
      rule,
      /box-sizing:\s*border-box/,
      "without border-box the 2px border is added on top and the badge outgrows the icon",
    );
  });

  test("the badge size derives from the icon size instead of repeating it", () => {
    const text = css();
    assert.match(ruleFor(text, ".check"), /--icon-box:\s*\d+px/, "the icon box is a named value");
    const badge = ruleFor(text, ".assignee-initial");
    assert.match(badge, /width:\s*calc\(var\(--icon-box\)/, "badge width follows the icon box");
    assert.doesNotMatch(
      badge,
      /width:\s*\d+px/,
      "a hard-coded width would drift apart from the icon again",
    );
  });
});

describe("Chores without a due date", () => {
  test("show no due line at all", () => {
    const env = loadCard();
    const card = makeCard(env);
    card.hass = makeHass({ tasks: [{ id: 1, name: "Irgendwann", due: null }] });

    const due = card.shadowRoot.querySelector(".due");
    assert.equal(due.textContent, "");
    assert.equal(due.hidden, true, "an empty line would still take up space");
  });

  test("a chore that gains a due date shows it again", () => {
    const env = loadCard();
    const card = makeCard(env);
    const hass = makeHass({ tasks: [{ id: 1, due: null }] });
    card.hass = hass;
    assert.equal(card.shadowRoot.querySelector(".due").hidden, true);

    const due = new Date(Date.now() + 86400000).toISOString();
    card.hass = withStates(hass, { "sensor.donetick_chores_1": { attributes: { next_due_date: due } } });
    assert.equal(card.shadowRoot.querySelector(".due").hidden, false);
    assert.equal(text(card.shadowRoot.querySelector(".due")), "Morgen fällig");
  });
});
