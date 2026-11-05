import { useEffect } from "react";

/** Sets the browser tab's title, e.g. "Inbox · SDK Playground · Flooper". */
export function usePageTitle(...parts: (string | undefined)[]): void {
  const title = [...parts.filter(Boolean), "Flooper"].join(" · ");
  useEffect(() => {
    document.title = title;
  }, [title]);
}
