import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { isTyping } from "../keys";

// Small messages at the bottom of the screen after an action, with an Undo
// where it can be taken back ("Marked done · Undo"). One at a time: a new one
// replaces the last, like Gmail's. Each fades after a few seconds.

export interface Toast {
  id: number;
  message: string;
  /** Takes the action back. The toast closes when it's clicked. */
  undo?: () => void;
  /** A follow-up, after Undo ("Marked done · Undo · Reply"). Closes the toast too. */
  action?: {
    label: string;
    icon?: ReactNode;
    run: () => void;
    /** A key that does the same while the toast shows, ahead of the page's own shortcuts. */
    key?: string;
  };
}

/** How long a toast stays, in milliseconds; longer with a follow-up to take. */
const SHOWN_FOR = 6000;
const SHOWN_WITH_ACTION_FOR = 10000;

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Show a message, replacing any that's showing. */
export function showToast(toast: Omit<Toast, "id">) {
  current = { ...toast, id: nextId++ };
  emit();
}

export function dismissToast() {
  current = null;
  emit();
}

function useToast(): Toast | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Where the toasts appear. Rendered once, by the app shell. */
export function Toasts() {
  const toast = useToast();

  // Fades after a while; a new toast starts its own clock.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(
      () => {
        if (current?.id === toast.id) dismissToast();
      },
      toast.action ? SHOWN_WITH_ACTION_FOR : SHOWN_FOR,
    );
    return () => clearTimeout(timer);
  }, [toast]);

  // "z" (or Ctrl/Cmd+Z) undoes, while there's something to undo.
  useEffect(() => {
    if (!toast?.undo) return;
    const undo = toast.undo;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event)) return;
      const plain = event.key === "z" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const command = event.key === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
      if (!plain && !command) return;
      event.preventDefault();
      dismissToast();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast]);

  // The follow-up's key. Listened for first (capture), so it beats the same
  // key's usual meaning on the page while the toast is up.
  useEffect(() => {
    const action = toast?.action;
    if (!action?.key) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== action.key || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event, ", dialog")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissToast();
      action.run();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toast]);

  return (
    <div className="toasts" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id} role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                dismissToast();
                toast.undo?.();
              }}
            >
              Undo
            </button>
          )}
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                dismissToast();
                toast.action?.run();
              }}
            >
              {toast.action.icon}
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={dismissToast}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
