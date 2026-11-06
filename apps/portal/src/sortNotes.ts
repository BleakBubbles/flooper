import type { Feedback, NoteSort, ProjectWithSummary } from "@flooper/shared/schemas";

/**
 * Sort notes in the browser, the same way the API does (SORT_KEYS in the
 * API's db/feedback.ts): by the column, then newest first for ties, then id.
 * Used when every note is already loaded, so sorting needs no request.
 */
export function sortNotes(
  notes: Feedback[],
  sort: { by: NoteSort; dir: "asc" | "desc" },
  sitesById: Map<string, Pick<ProjectWithSummary, "name">>,
): Feedback[] {
  const key = (n: Feedback): string | number => {
    switch (sort.by) {
      case "site":
        return (sitesById.get(n.projectId)?.name ?? "").toLowerCase();
      case "reaction":
        // Bugs first, then ideas, questions, love, and notes without a reaction.
        return n.reaction ? ["bug", "idea", "confused", "love"].indexOf(n.reaction) : 4;
      case "page":
        return n.context.url;
      case "note":
        return (n.message ?? "").toLowerCase();
      case "time":
        return n.createdAt;
    }
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...notes].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return (ka < kb ? -1 : 1) * sign;
    if (sort.by !== "time" && a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return (a.id < b.id ? -1 : 1) * (sort.by === "time" ? sign : -1);
  });
}
