import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./icons";

/**
 * Search over the notes: their text, their page, or the text of the element
 * they point at. Typing waits a moment before searching, so it doesn't search
 * for every letter. "/" jumps here from anywhere; Esc clears it, then leaves.
 */
export function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  // Follows the URL (back, forward, a shared link).
  useEffect(() => setText(value), [value]);

  // A moment after typing stops.
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onSearch(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text, value, onSearch]);

  // "/" from anywhere that isn't a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="search-box">
      <SearchIcon />
      <input
        ref={input}
        type="search"
        placeholder="Search notes"
        aria-label="Search notes"
        aria-keyshortcuts="/"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // The first Esc clears; the next leaves the box. Either way, the
            // open note (which Esc also closes) stays.
            event.stopPropagation();
            if (text) {
              setText("");
              onSearch("");
            } else input.current?.blur();
          }
          if (event.key === "Enter") onSearch(text.trim());
        }}
      />
      {text ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear the search"
          onClick={() => {
            setText("");
            onSearch("");
            input.current?.focus();
          }}
        >
          ×
        </button>
      ) : (
        <span className="search-key" aria-hidden="true">
          /
        </span>
      )}
    </label>
  );
}
