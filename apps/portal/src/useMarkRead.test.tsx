import type { Feedback } from "@flooper/shared/schemas";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMarkRead } from "./useMarkRead";

// Lets React's act() work outside a test framework that sets it up.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const note = (id: string, status: Feedback["status"] = "new") => ({ id, status }) as Feedback;

function Probe({ open, onRead }: { open?: Feedback; onRead: (id: string) => void }) {
  useMarkRead(open, onRead);
  return null;
}

describe("useMarkRead", () => {
  let root: Root;
  let onRead: ReturnType<typeof vi.fn<(id: string) => void>>;
  const show = (open?: Feedback) =>
    act(() => {
      root.render(
        <StrictMode>
          <Probe open={open} onRead={onRead} />
        </StrictMode>,
      );
    });
  const tick = () => act(() => new Promise((r) => setTimeout(r, 5)));

  beforeEach(() => {
    root = createRoot(document.createElement("div"));
    onRead = vi.fn();
  });
  afterEach(() => act(() => root.unmount()));

  it("leaves an unread note alone while it's open, however long", async () => {
    await show(note("a"));
    await tick();
    expect(onRead).not.toHaveBeenCalled();
  });

  it("marks it read when it's closed", async () => {
    await show(note("a"));
    await show(undefined);
    await tick();
    expect(onRead).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("marks it read when another note opens", async () => {
    await show(note("a"));
    await show(note("b"));
    await tick();
    expect(onRead).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("marks it read when the list goes away", async () => {
    await show(note("a"));
    await act(() => root.unmount());
    await tick();
    expect(onRead).toHaveBeenCalledExactlyOnceWith("a");
    root = createRoot(document.createElement("div"));
  });

  it("leaves a note that was already read", async () => {
    await show(note("a", "seen"));
    await show(undefined);
    await tick();
    expect(onRead).not.toHaveBeenCalled();
  });

  it("keeps your own choice: a note you marked unread while it was open stays unread", async () => {
    await show(note("a"));
    await show(note("a", "seen"));
    await show(note("a", "new"));
    await show(undefined);
    await tick();
    expect(onRead).not.toHaveBeenCalled();
  });
});
