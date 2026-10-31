// All widget CSS lives inside the Shadow DOM, so the host site's styles can't
// break the widget and the widget's styles can't leak onto the host site.
// `all: initial` on :host also stops *inherited* properties (font, color,
// line-height...) from flowing in, which Shadow DOM alone doesn't prevent.
export const STYLES = `
:host {
  all: initial;
  --bg: #ffffff;
  --fg: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --soft: #f4f4f5;
  --launcher-bg: #18181b;
  --launcher-fg: #ffffff;
  --accent: #18181b;
  --accent-fg: #ffffff;
  --danger: #dc2626;
  --shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --bg: #1c1c1f; --fg: #f4f4f5; --muted: #a1a1aa; --border: #333338; --soft: #27272a;
    --launcher-bg: #f4f4f5; --launcher-fg: #18181b; --accent: #f4f4f5; --accent-fg: #18181b;
    --danger: #f87171; --shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
}
:host([data-theme="dark"]) {
  --bg: #1c1c1f; --fg: #f4f4f5; --muted: #a1a1aa; --border: #333338; --soft: #27272a;
  --launcher-bg: #f4f4f5; --launcher-fg: #18181b; --accent: #f4f4f5; --accent-fg: #18181b;
  --danger: #f87171; --shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

.flooper {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--fg);
}
.flooper[data-position="bottom-left"] { right: auto; left: 20px; align-items: flex-start; }

.launcher {
  width: 48px;
  height: 48px;
  padding: 9px;
  border: 0;
  border-radius: 50%;
  background: var(--launcher-bg);
  color: var(--launcher-fg);
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 160ms ease;
}
.launcher:hover { transform: scale(1.06) rotate(-6deg); }
.launcher:active { transform: scale(0.96); }
.launcher svg { display: block; width: 100%; height: 100%; }
.launcher .w { fill: currentColor; }
.launcher .k { fill: var(--launcher-bg); }
.launcher .ks { stroke: var(--launcher-bg); }
.launcher .ws { stroke: currentColor; }

.panel {
  width: 300px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg);
  box-shadow: var(--shadow);
  transform-origin: bottom right;
  animation: pop 160ms ease-out;
}
.flooper[data-position="bottom-left"] .panel { transform-origin: bottom left; }
@keyframes pop { from { opacity: 0; transform: translateY(6px) scale(0.97); } }

.title { margin: 0 0 12px; font-weight: 600; font-size: 15px; }

.reactions { display: flex; gap: 8px; margin-bottom: 10px; }
.reaction {
  flex: 1;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--soft);
  font-size: 18px;
  cursor: pointer;
  transition: transform 120ms ease, border-color 120ms ease;
}
.reaction:hover { transform: translateY(-1px); }
.reaction[aria-pressed="true"] { border-color: var(--fg); background: var(--bg); transform: scale(1.05); }

textarea {
  display: block;
  width: 100%;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--fg);
  font: inherit;
  resize: vertical;
}
textarea::placeholder { color: var(--muted); }

.hp { position: absolute; left: -10000px; width: 1px; height: 1px; opacity: 0; }

.footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.status { font-size: 12px; color: var(--muted); }
.status[data-tone="error"] { color: var(--danger); }
.send {
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.send:disabled { opacity: 0.4; cursor: default; }

.thanks { padding: 12px 4px; text-align: center; }
.thanks strong { display: block; font-size: 16px; margin-bottom: 4px; }
.thanks span { color: var(--muted); }

button:focus-visible, textarea:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }

.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
