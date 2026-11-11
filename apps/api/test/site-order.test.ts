import { describe, expect, it } from "vitest";
import { createProject, json, loginAsDev, request } from "./helpers";

async function names(cookie: string): Promise<string[]> {
  const res = await request("/api/v1/projects", { headers: { Cookie: cookie } });
  const { data } = (await res.json()) as { data: { id: string; name: string }[] };
  return data.map((p) => p.name);
}

async function site(cookie: string, name: string) {
  const res = await json(
    "POST",
    "/api/v1/projects",
    { name, allowedOrigins: [] },
    { Cookie: cookie },
  );
  return (await res.json()) as { id: string };
}

describe("PUT /api/v1/projects/order", () => {
  it("keeps the owner's order, with new sites joining at the end", async () => {
    const cookie = await loginAsDev();
    const before = await names(cookie);
    const a = await site(cookie, "Order A");
    await site(cookie, "Order B");
    const c = await site(cookie, "Order C");
    expect((await names(cookie)).slice(-3)).toEqual(["Order A", "Order B", "Order C"]);

    // Only some IDs: these go first, in this order; the rest keep theirs after.
    const res = await json(
      "PUT",
      "/api/v1/projects/order",
      { ids: [c.id, a.id] },
      { Cookie: cookie },
    );
    expect(res.status).toBe(204);
    const after = await names(cookie);
    expect(after.slice(0, 2)).toEqual(["Order C", "Order A"]);
    expect(after.indexOf("Order B")).toBeGreaterThan(1);
    expect(after).toHaveLength(before.length + 3);

    // A new site still goes to the end.
    await site(cookie, "Order D");
    expect((await names(cookie)).at(-1)).toBe("Order D");
  });

  it("ignores IDs that aren't yours, and refuses an empty list", async () => {
    const cookie = await loginAsDev();
    await createProject(cookie);
    const res = await json(
      "PUT",
      "/api/v1/projects/order",
      { ids: ["prj_someone_else"] },
      { Cookie: cookie },
    );
    expect(res.status).toBe(204);
    const empty = await json("PUT", "/api/v1/projects/order", { ids: [] }, { Cookie: cookie });
    expect(empty.status).toBe(422);
  });
});
