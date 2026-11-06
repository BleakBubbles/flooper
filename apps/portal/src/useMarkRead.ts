import type { Feedback } from "@flooper/shared/schemas";
import { useEffect, useRef } from "react";

/** How long a note stays open before it counts as read. */
export const READ_AFTER_MS = 1500;

/**
 * Marks a note read once it has stayed open for a moment, the way a mail
 * app's reading pane does. A note opened automatically (the inbox opens the
 * first one) or skipped past quickly isn't marked; one you stop on is.
 */
export function useMarkRead(note: Feedback | undefined, markRead: (id: string) => void) {
  // The latest callback, without restarting the timer when it changes.
  const latest = useRef(markRead);
  latest.current = markRead;

  // Only a note that was unread when it opened, and only once per opening: if
  // you mark the open note unread, that sticks until you open another one.
  const opening = useRef<{ id: string | undefined; wasNew: boolean; done: boolean }>({
    id: undefined,
    wasNew: false,
    done: false,
  });
  const id = note?.id;
  const isNew = note?.status === "new";
  if (opening.current.id !== id) opening.current = { id, wasNew: isNew, done: false };

  useEffect(() => {
    const current = opening.current;
    if (!id || !isNew || !current.wasNew || current.done) return;
    const timer = setTimeout(() => {
      current.done = true;
      latest.current(id);
    }, READ_AFTER_MS);
    return () => clearTimeout(timer);
  }, [id, isNew]);
}
