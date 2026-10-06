import { DonetickChoresCard } from "./card.js";
import { DonetickChoresCardEditor } from "./editor.js";
import { resolveLanguage, translate } from "./i18n.js";

if (!customElements.get("donetick-chores-card")) {
  customElements.define("donetick-chores-card", DonetickChoresCard);
}
if (!customElements.get("donetick-chores-card-editor")) {
  customElements.define("donetick-chores-card-editor", DonetickChoresCardEditor);
}

// The card picker entry is registered before any hass object exists. Home
// Assistant writes the user's language onto <html lang>, which is the closest
// thing available at this point; without it the entry is German.
const pickerLanguage = resolveLanguage(undefined, { language: document.documentElement.lang });

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "donetick-chores-card")) {
  window.customCards.push({
    type: "donetick-chores-card",
    name: translate(pickerLanguage, "picker.name"),
    description: translate(pickerLanguage, "picker.description"),
    preview: true,
  });
}
