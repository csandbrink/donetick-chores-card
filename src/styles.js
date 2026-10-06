// Parsed once per page and shared by every card instance, rather than written
// into the shadow root again on every render.
export const STYLES = `
:host { display: block; }
ha-card { overflow: hidden; }
.header { padding: 14px 14px 10px 20px; display: flex; align-items: center; gap: 12px; }
.title { flex: 1; font-size: 1.25rem; font-weight: 600; color: var(--primary-text-color); }
.count { font-size: .82rem; color: var(--secondary-text-color); }
.add { width: 44px; height: 44px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
.add ha-icon { --mdc-icon-size: 25px; }
.list { padding: 0 10px 10px; }
.task { border-top: 1px solid var(--divider-color); padding: 8px 4px; transition: background .15s ease; }
.task:first-child { border-top: 0; }
.task.expanded { background: var(--secondary-background-color); background: color-mix(in srgb, var(--primary-color) 6%, transparent); border-radius: 12px; }
.task-main { min-height: 48px; display: flex; align-items: center; }
button { font: inherit; }
.check { --icon-box: 27px; width: 44px; height: 44px; flex: 0 0 44px; border: 0; border-radius: 50%; background: transparent; color: var(--primary-color); cursor: pointer; display: grid; place-items: center; }
.check ha-icon { --mdc-icon-size: var(--icon-box); }
/* The badge has to match the circle the icon actually draws, not the icon box.
   MDI's outline circles have radius 10 in a 24-unit viewBox, so the drawn circle
   is 20/24 of the box - 22.5px at an icon box of 27px. Sizing the badge to the
   box instead made assigned chores show a visibly larger circle than
   unassigned ones. Deriving it keeps the two tied together. */
.assignee-initial { box-sizing: border-box; width: calc(var(--icon-box) * 20 / 24); height: calc(var(--icon-box) * 20 / 24); display: grid; place-items: center; border: 2px solid currentColor; border-radius: 50%; font-size: .68rem; line-height: 1; font-weight: 700; }
.text { min-width: 0; padding: 3px 8px 3px 2px; }
.name { color: var(--primary-text-color); font-size: .98rem; line-height: 1.3; overflow-wrap: anywhere; }
.due { color: var(--secondary-text-color); font-size: .78rem; margin-top: 2px; }
.due.overdue { color: var(--error-color); }
.task.done .name { text-decoration: line-through; opacity: .55; }
.task.done .due { font-style: italic; }
.task.done .check { color: var(--success-color, #43a047); cursor: default; }
/* Lines up with the circle above it, not with the task name. The check button
   is 44px wide but the circle drawn inside it is 27px and centred, so it starts
   8px in - matching the button box instead would leave the label hanging out to
   the left. */
.chooser { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding: 4px 8px 8px 8px; }
.chooser-label { color: var(--secondary-text-color); font-size: .78rem; margin-right: 2px; }
.member { position: relative; width: 34px; height: 34px; flex: 0 0 34px; border: 1px solid var(--primary-color); border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 50%; background: var(--card-background-color); background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; box-shadow: none; }
button:disabled { opacity: .55; cursor: wait; }
.empty, .loading { padding: 20px; color: var(--secondary-text-color); }
.spinner { width: 19px; height: 19px; border: 2px solid var(--divider-color); border-top-color: var(--primary-color); border-radius: 50%; animation: spin .8s linear infinite; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .48); }
.dialog { box-sizing: border-box; width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; border-radius: 18px; background: var(--card-background-color); color: var(--primary-text-color); box-shadow: 0 16px 50px rgba(0, 0, 0, .35); }
.dialog-header { display: flex; align-items: center; padding: 18px 20px 8px; }
.dialog-header h2 { flex: 1; margin: 0; font-size: 1.25rem; }
.dialog-close { width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: var(--secondary-text-color); font-size: 1.7rem; cursor: pointer; }
.create-form { display: grid; gap: 15px; padding: 10px 20px 20px; }
.create-form label { display: grid; gap: 6px; color: var(--secondary-text-color); font-size: .85rem; }
.create-form input, .create-form textarea, .create-form select { box-sizing: border-box; width: 100%; border: 1px solid var(--divider-color); border-radius: 10px; padding: 11px 12px; background: var(--card-background-color); color: var(--primary-text-color); font: inherit; }
.create-form input:focus, .create-form textarea:focus, .create-form select:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
.create-form fieldset { margin: 0; padding: 0; border: 0; }
.create-form legend { margin-bottom: 8px; color: var(--secondary-text-color); font-size: .85rem; }
.create-members { display: flex; flex-wrap: wrap; gap: 9px; }
.create-member { position: relative; min-width: 38px; height: 38px; padding: 0 10px; border: 1px solid var(--primary-color); border: 1px solid color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 19px; background: var(--card-background-color); background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); color: var(--primary-color); font-weight: 700; cursor: pointer; }
/* The visible circles stay small on purpose - they read better in a row of
   five. The tap target is widened with a transparent pseudo-element instead,
   which reaches 44 px without growing the drawn circle. Padding could not do
   this: it sits inside the border, so it would enlarge the circle itself. */
.member::after, .create-member::after { content: ""; position: absolute; inset: -4px; border-radius: inherit; }
.create-member::after { inset: -3px; }
.create-member.selected { background: var(--primary-color); color: var(--text-primary-color); }
.status-text { flex: 1; }
.status-close { flex: 0 0 auto; box-sizing: content-box; width: 28px; height: 28px; padding: 8px; margin: -8px -4px -8px 0; border: 0; border-radius: 50%; background: transparent; color: var(--primary-text-color); font-size: 1.2rem; line-height: 1; cursor: pointer; }
.form-error { border-radius: 10px; padding: 10px 12px; border: 1px solid var(--error-color); background: transparent; background: color-mix(in srgb, var(--error-color) 12%, transparent); color: var(--error-color); font-size: .85rem; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 2px; }
.dialog-actions button { min-height: 40px; border: 0; border-radius: 10px; padding: 0 16px; cursor: pointer; }
.cancel { background: transparent; color: var(--primary-text-color); }
.save { background: var(--primary-color); color: var(--text-primary-color); font-weight: 600; }
.status { display: flex; align-items: center; gap: 8px; margin: 0 14px 10px; border-radius: 10px; padding: 9px 12px; border: 1px solid var(--success-color, #43a047); background: transparent; background: color-mix(in srgb, var(--success-color, #43a047) 12%, transparent); color: var(--primary-text-color); font-size: .84rem; }
/* On a touchscreen a hover state sticks after a tap until you tap somewhere
   else, which on a wall tablet makes a button look permanently pressed. So:
   real pointing devices only. */
@media (hover: hover) and (pointer: fine) {
  .add:hover { background: var(--divider-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .check:hover:not(:disabled) { background: var(--divider-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
  .member:hover:not(:disabled) { background: var(--primary-color); color: var(--text-primary-color); transform: translateY(-1px); }
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 420px) {
  .header { padding-inline: 16px; }
  .chooser-label { display: none; }
}
/* An element carrying the hidden attribute only gets display: none from the
   browser stylesheet, which any display declaration here would beat. Every
   class the card hides needs its own override. */
.chooser[hidden] { display: none; }
.status[hidden] { display: none; }
`;

let cachedStyleSheet;
export function sharedStyleSheet() {
  if (cachedStyleSheet !== undefined) return cachedStyleSheet;
  try {
    if (typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(STYLES);
      cachedStyleSheet = sheet;
      return cachedStyleSheet;
    }
  } catch {
    // Older engines fall through to a <style> element below.
  }
  cachedStyleSheet = null;
  return cachedStyleSheet;
}
