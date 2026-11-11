import { useEffect, useRef } from "react";
import { isTyping } from "../keys";

/** The keyboard shortcuts, as the cheat sheet lists them. */
const SHORTCUTS: { group: string; keys: [string[], string][] }[] = [
  {
    group: "Moving around",
    keys: [
      [["j"], "Next note"],
      [["k"], "Previous note"],
      [["Enter"], "Open the note"],
      [["Esc"], "Close the note"],
      [["/"], "Search"],
      [["["], "Collapse or expand the sidebar"],
    ],
  },
  {
    group: "Notes",
    keys: [
      [["e"], "Archive"],
      [["d"], "Mark done"],
      [["r"], "Reply, if they asked to hear back"],
      [["u"], "Mark read or unread"],
      [["#"], "Delete"],
      [["z"], "Undo"],
    ],
  },
  {
    group: "Selecting",
    keys: [
      [["x"], "Select the note"],
      [["Shift", "j"], "Select the next one too"],
      [["Shift", "k"], "Select the previous one too"],
      [["Esc"], "Clear the selection"],
    ],
  },
  {
    group: "Help",
    keys: [[["?"], "Show these shortcuts"]],
  },
];

const OPEN_EVENT = "flooper:shortcuts";

/** Opens the cheat sheet (from the account menu, say). */
export function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The keyboard shortcuts, in a dialog: "?" from anywhere that isn't a field,
 * or "Keyboard shortcuts" in the account menu. Esc or a click outside closes it.
 */
export function ShortcutsHelp() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, open);
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the dialog natively; the click is for pointers.
    <dialog
      ref={dialog}
      className="shortcuts"
      aria-labelledby="shortcuts-heading"
      // A click on the backdrop (the dialog itself, outside its content) closes it.
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="shortcuts-inner">
        <div className="shortcuts-head">
          <h2 id="shortcuts-heading" className="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {SHORTCUTS.map(({ group, keys }) => (
          <section key={group}>
            <h3 className="shortcuts-group">{group}</h3>
            <dl>
              {keys.map(([combo, what]) => (
                <div key={what}>
                  <dt>{what}</dt>
                  <dd>
                    {combo.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
