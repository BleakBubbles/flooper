import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError, keys } from "./api";
import { createQueryClient } from "./queryClient";

const unauthorized = () =>
  new ApiRequestError(401, { code: "unauthorized", message: "You need to log in first" });

describe("createQueryClient", () => {
  it("re-checks who's logged in when any other request comes back 401", async () => {
    const client = createQueryClient();
    const me = vi.fn().mockResolvedValue({ id: "usr_1" });
    // An active "me" observer, like the layout's, so invalidating it refetches.
    const observer = new QueryObserver(client, { queryKey: keys.me, queryFn: me });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1));

    await client
      .fetchQuery({ queryKey: keys.projects, queryFn: () => Promise.reject(unauthorized()) })
      .catch(() => {});

    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(2));
    unsubscribe();
  });

  it("doesn't loop when the check itself is the 401", async () => {
    const client = createQueryClient();
    const me = vi.fn().mockRejectedValue(unauthorized());
    const observer = new QueryObserver(client, { queryKey: keys.me, queryFn: me });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(me).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("retries network and server errors, but not 4xx", () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry;
    if (typeof retry !== "function") throw new Error("expected a retry function");
    const error = (status: number) => new ApiRequestError(status, { code: "x", message: "x" });
    expect(retry(0, error(0))).toBe(true);
    expect(retry(0, error(503))).toBe(true);
    expect(retry(0, error(404))).toBe(false);
    expect(retry(0, unauthorized())).toBe(false);
    expect(retry(2, error(503))).toBe(false);
  });
});
