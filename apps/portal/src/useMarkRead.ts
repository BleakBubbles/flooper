import type { Feedback } from "@flooper/shared/schemas";
import { useEffect, useRef } from "react";

/** One opening of a note: what it was when it opened, and whether you changed it since. */
type Opening = { id: string | undefined; wasNew: boolean; touched: boolean; status?: string };

/**
 * Marks a note read when you're done with it: when you close it, open
 * another note, or leave the list (a site's settings, say). While it's open
 * it stays unread, so its row stays bold and nothing shifts under you.
 *
 * Only a note that was unread when it opened, and only if you left its status
 * alone while it was open: marking it unread (or read, done, archived)
 * yourself is a choice this doesn't override.
 */
export function useMarkRead(note: Feedback | undefined, markRead: (id: string) => void) {
  // The latest callback, without re-running the effect when it changes.
  const latest = useRef(markRead);
  latest.current = markRead;

  const id = note?.id;
  const status = note?.status;
  const opening = useRef<Opening>({ id: undefined, wasNew: false, touched: false });
  if (opening.current.id !== id) {
    // A new opening gets a record of its own...
    opening.current = { id, wasNew: status === "new", touched: false, status };
  } else if (opening.current.status !== status) {
    // ...and a change while it's open is noted on that same record.
    opening.current.touched = true;
    opening.current.status = status;
  }

  // A closing is marked a tick later, and called off if the same note is
  // straight back: React's development mode closes and reopens everything
  // once on mount, which isn't you clicking off it.
  const pending = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (pending.current && pending.current.id === id) {
      clearTimeout(pending.current.timer);
      pending.current = null;
    }
    const closing = opening.current;
    return () => {
      const closingId = closing.id;
      if (!closingId || !closing.wasNew || closing.touched) return;
      pending.current = {
        id: closingId,
        timer: setTimeout(() => {
          pending.current = null;
          latest.current(closingId);
        }, 0),
      };
    };
  }, [id]);
}
