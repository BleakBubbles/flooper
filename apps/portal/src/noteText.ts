import type { Feedback } from "@flooper/shared/schemas";

/** What a note is about, in a line: its message, else the element, else the page. */
export function headline(note: Feedback): string {
  if (note.message) return note.message;
  if (note.target) return note.target.text ? `“${note.target.text}”` : note.target.selector;
  return note.context.title ?? note.context.path;
}
