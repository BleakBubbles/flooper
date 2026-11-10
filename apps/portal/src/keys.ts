/**
 * Whether a key press belongs to whatever has focus rather than to the app's
 * keyboard shortcuts: typing in a field, or anything inside another widget's
 * shadow root (the "Send feedback" widget is one).
 *
 * Inside a shadow root, `event.target` at the window is the widget's outer
 * element, not its text box, so the real element comes from composedPath().
 */
export function isTyping(event: KeyboardEvent, alsoIgnore = ""): boolean {
  const el = event.composedPath()[0] ?? event.target;
  if (!(el instanceof Element)) return false;
  // A widget's own keys stay the widget's.
  if (el.getRootNode() instanceof ShadowRoot) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.closest(`input, textarea, select, [contenteditable]${alsoIgnore}`) !== null;
}
