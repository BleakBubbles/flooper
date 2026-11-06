import type { Feedback } from "@flooper/shared/schemas";
import { describe, expect, it } from "vitest";
import { sortNotes } from "./sortNotes";

// The same four notes and expected orders as the API's sort test
// (apps/api/test/portal.test.ts), so the browser and the server agree.
const note = (
  id: string,
  projectId: string,
  reaction: Feedback["reaction"],
  message: string | null,
  url: string,
  minute: number,
) =>
  ({
    id,
    projectId,
    reaction,
    message,
    status: "new",
    context: { url, path: new URL(url).pathname },
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(),
  }) as Feedback;

const notes = [
  note("fb_1", "prj_b", "love", "zebra", "https://b.example/z", 1),
  note("fb_2", "prj_a", "bug", "apple", "https://a.example/a", 2),
  note("fb_3", "prj_b", null, "Mango", "https://b.example/m", 3),
  note("fb_4", "prj_a", "idea", null, "https://a.example/b", 4),
];
const sites = new Map([
  ["prj_a", { name: "alpha" }],
  ["prj_b", { name: "Beta" }],
]);
const ids = (by: Parameters<typeof sortNotes>[1]["by"], dir: "asc" | "desc") =>
  sortNotes(notes, { by, dir }, sites).map((n) => n.id);

describe("sortNotes", () => {
  it("sorts like the API: by the column, then newest first for ties", () => {
    expect(ids("site", "asc")).toEqual(["fb_4", "fb_2", "fb_3", "fb_1"]);
    expect(ids("site", "desc")).toEqual(["fb_3", "fb_1", "fb_4", "fb_2"]);
    expect(ids("reaction", "asc")).toEqual(["fb_2", "fb_4", "fb_1", "fb_3"]);
    expect(ids("note", "asc")).toEqual(["fb_4", "fb_2", "fb_3", "fb_1"]);
    expect(ids("page", "asc")).toEqual(["fb_2", "fb_4", "fb_3", "fb_1"]);
    expect(ids("time", "asc")).toEqual(["fb_1", "fb_2", "fb_3", "fb_4"]);
    expect(ids("time", "desc")).toEqual(["fb_4", "fb_3", "fb_2", "fb_1"]);
  });

  it("leaves the list it was given alone", () => {
    const before = notes.map((n) => n.id);
    ids("note", "desc");
    expect(notes.map((n) => n.id)).toEqual(before);
  });
});
