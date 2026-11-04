/**
 * Draws an outline around an element on the host page, and keeps it in place
 * while the page scrolls or resizes. Shared by everything that needs to say
 * "this one": pick mode, hovering the picked-element chip, and (later)
 * "Show me on the page" links from the portal.
 *
 * The outline is a fixed-position box in the widget's shadow root, sized from
 * the element's on-screen rectangle. Nothing on the host page is modified.
 */
export class Highlighter {
  private target: Element | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly box: HTMLElement,
    private readonly label: HTMLElement,
  ) {}

  /** Outline `el`, with an optional caption above it. */
  show(el: Element, caption?: string): void {
    clearTimeout(this.flashTimer);
    if (!this.target) {
      // Capture phase, so scrolling inside any container also moves the box.
      window.addEventListener("scroll", this.redraw, true);
      window.addEventListener("resize", this.redraw);
    }
    this.target = el;
    this.label.textContent = caption ?? "";
    this.label.hidden = !caption;
    this.redraw();
  }

  /** Outline `el` for a moment, then fade it out. */
  flash(el: Element, ms = 1600): void {
    this.show(el);
    this.flashTimer = setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    clearTimeout(this.flashTimer);
    if (this.target) {
      window.removeEventListener("scroll", this.redraw, true);
      window.removeEventListener("resize", this.redraw);
    }
    this.target = null;
    this.box.hidden = true;
  }

  private redraw = () => {
    // The element may have been removed (single-page apps swap content).
    if (!this.target?.isConnected) {
      this.hide();
      return;
    }
    const rect = this.target.getBoundingClientRect();
    Object.assign(this.box.style, {
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    // Keep the caption on screen when the element touches the top edge.
    this.box.dataset.labelBelow = String(rect.top < 28);
    this.box.hidden = false;
  };
}
