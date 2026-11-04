import type { Highlighter } from "./highlight";
import { cssSelector, resolveTarget, textSnippet } from "./selector";

/** What gets stored with the note. */
export interface PickedTarget {
  selector: string;
  text?: string;
}

export interface PickResult {
  target: PickedTarget;
  /** The live element, so the widget can highlight it without re-querying. */
  element: Element;
}

/** Finds the page elements under a point, topmost first. Injectable for tests. */
export type HitTest = (x: number, y: number) => Element[];

/**
 * Pick mode: a transparent layer over the whole page that outlines whatever is
 * under the pointer and records what the visitor clicks.
 *
 * Why a covering layer instead of listening to the page's own events: the page
 * never receives a single pointer event while picking, so links can't be
 * followed, buttons can't fire, and hover menus don't flicker open. We find
 * the element underneath with `elementsFromPoint`, skipping our own layer.
 * Scrolling still works, because wheel and touch scrolling fall through a
 * non-scrollable layer to the page.
 */
export class Picker {
  private readonly layer: HTMLElement;
  private readonly cancelButton: HTMLButtonElement;
  private current: Element | null = null;
  private pointer: { x: number; y: number } | null = null;
  private finish: ((result: PickResult | null) => void) | null = null;

  constructor(
    root: ShadowRoot,
    private readonly host: HTMLElement,
    private readonly highlighter: Highlighter,
    private readonly hitTest: HitTest = (x, y) => document.elementsFromPoint(x, y),
  ) {
    this.layer = root.querySelector(".pick-layer") as HTMLElement;
    this.cancelButton = root.querySelector(".pick-cancel") as HTMLButtonElement;

    this.layer.addEventListener("pointermove", (e) => this.track(e.clientX, e.clientY));
    this.layer.addEventListener("click", (e) => {
      if (e.target === this.cancelButton) return;
      this.track(e.clientX, e.clientY);
      const element = this.current;
      this.done(
        element
          ? { element, target: { selector: cssSelector(element), text: textSnippet(element) } }
          : null,
      );
    });
    this.cancelButton.addEventListener("click", () => this.done(null));
  }

  get active(): boolean {
    return this.finish !== null;
  }

  /** Enter pick mode. Resolves with the picked element, or null if cancelled. */
  pick(): Promise<PickResult | null> {
    this.cancel();
    this.layer.hidden = false;
    this.cancelButton.focus();
    document.addEventListener("keydown", this.onKey, true);
    window.addEventListener("scroll", this.onScroll, true);
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  }

  cancel(): void {
    this.done(null);
  }

  private done(result: PickResult | null): void {
    const finish = this.finish;
    if (!finish) return;
    this.finish = null;
    this.layer.hidden = true;
    this.current = null;
    this.pointer = null;
    this.highlighter.hide();
    document.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("scroll", this.onScroll, true);
    finish(result);
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };

  // After a scroll, a different element may be under the (unmoved) pointer.
  private onScroll = () => {
    if (this.pointer) this.track(this.pointer.x, this.pointer.y);
  };

  private track(x: number, y: number): void {
    this.pointer = { x, y };
    // Our layer lives in a shadow root, so the hit list reports it as the host.
    const hit = this.hitTest(x, y).find((el) => el !== this.host && !this.host.contains(el));
    const next = hit ? resolveTarget(hit) : null;
    if (next === this.current) return;
    this.current = next;
    if (next) {
      this.highlighter.show(next, textSnippet(next) ?? `<${next.tagName.toLowerCase()}>`);
    } else {
      this.highlighter.hide();
    }
  }
}
