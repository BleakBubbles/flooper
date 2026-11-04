import { LIMITS, REACTION_EMOJI, REACTIONS, type Reaction } from "@flooper/shared";
import { Highlighter } from "../picker/highlight";
import { type PickedTarget, Picker } from "../picker/picker";
import { LOGO_SVG } from "./icon";
import { ICONS } from "./icons";
import STYLES from "./widget.css?inline";

/** Shown as the placeholder; → in the empty box fills it in for real. */
const EXAMPLE_MESSAGE = "Cool website!";

const REACTION_LABELS: Record<Reaction, string> = {
  love: "Love it",
  idea: "I have an idea",
  confused: "Something's confusing",
  bug: "Something's broken",
};

export interface WidgetOptions {
  position: "bottom-right" | "bottom-left";
  theme: "auto" | "light" | "dark";
  title: string;
}

export interface WidgetInput {
  reaction?: Reaction;
  message?: string;
  target?: PickedTarget;
  hp?: string;
}

/** Resolves true if the submission was accepted. */
export type SubmitHandler = (input: WidgetInput) => Promise<boolean>;

/**
 * The widget's UI and nothing else. It knows how to draw itself and collect
 * input, but not where input goes; `onSubmit` handles that. Keeping the
 * network out of here makes the UI easy to test on its own.
 */
export class Widget {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly el: {
    launcher: HTMLButtonElement;
    panel: HTMLElement;
    form: HTMLFormElement;
    thanks: HTMLElement;
    message: HTMLTextAreaElement;
    hp: HTMLInputElement;
    send: HTMLButtonElement;
    status: HTMLElement;
    reactions: HTMLButtonElement[];
    point: HTMLButtonElement;
    chip: HTMLElement;
    chipText: HTMLButtonElement;
    chipLabel: HTMLElement;
    chipClear: HTMLButtonElement;
  };
  private readonly picker: Picker;
  private readonly highlighter: Highlighter;
  private reaction: Reaction | undefined;
  private target: PickedTarget | undefined;
  /** The picked element itself, while it's still on the page. */
  private targetElement: Element | null = null;
  private sending = false;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    options: WidgetOptions,
    private readonly onSubmit: SubmitHandler,
  ) {
    this.host = document.createElement("flooper-widget");
    if (options.theme !== "auto") this.host.dataset.theme = options.theme;
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = template(options.position);

    const $ = <T extends Element>(selector: string) => this.root.querySelector(selector) as T;
    this.el = {
      launcher: $(".launcher"),
      panel: $(".panel"),
      form: $("form"),
      thanks: $(".thanks"),
      message: $("textarea"),
      hp: $(".hp"),
      send: $(".send"),
      status: $(".status"),
      reactions: [...this.root.querySelectorAll<HTMLButtonElement>(".reaction")],
      point: $(".point"),
      chip: $(".target-chip"),
      chipText: $(".target-text"),
      chipLabel: $(".target-label"),
      chipClear: $(".target-clear"),
    };
    this.highlighter = new Highlighter($(".highlight"), $(".highlight-label"));
    this.picker = new Picker(this.root, this.host, this.highlighter);
    // textContent, not innerHTML: the title comes from site config and must
    // never be interpreted as markup.
    $<HTMLElement>(".title").textContent = options.title;

    this.el.launcher.addEventListener("click", () => this.toggle());
    for (const button of this.el.reactions) {
      button.addEventListener("click", () =>
        this.pickReaction(button.dataset.reaction as Reaction),
      );
    }
    this.el.message.addEventListener("input", () => this.refresh());
    this.el.message.addEventListener("keydown", (event) => {
      // Like accepting an inline suggestion: → in an empty box takes the example.
      if (event.key === "ArrowRight" && this.el.message.value === "") {
        event.preventDefault();
        this.el.message.value = this.el.message.placeholder;
        this.refresh();
      }
    });
    this.el.point.addEventListener("click", () => void this.pickTarget());
    // Hovering or focusing the chip outlines the picked element on the page;
    // clicking it also scrolls there (and is how this works on touch screens).
    this.el.chip.addEventListener("mouseenter", () => this.showTarget());
    this.el.chip.addEventListener("mouseleave", () => {
      if (!this.el.chip.matches(":focus-within")) this.highlighter.hide();
    });
    this.el.chipText.addEventListener("focus", () => this.showTarget());
    this.el.chipText.addEventListener("blur", () => this.highlighter.hide());
    this.el.chipText.addEventListener("click", () => this.showTarget({ scroll: true }));
    this.el.chipClear.addEventListener("click", () => {
      this.target = undefined;
      this.targetElement = null;
      this.highlighter.hide();
      this.refresh();
      this.el.point.focus();
    });
    this.el.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.root.addEventListener("keydown", (event) => {
      // While picking, Escape belongs to the picker (it cancels pick mode).
      if ((event as KeyboardEvent).key === "Escape" && !this.picker.active) this.close();
    });
    this.refresh();
  }

  get isOpen(): boolean {
    return !this.el.panel.hidden;
  }

  mount(parent: HTMLElement = document.body): void {
    parent.appendChild(this.host);
    document.addEventListener("pointerdown", this.onOutsidePointer, true);
  }

  destroy(): void {
    clearTimeout(this.resetTimer);
    this.picker.cancel();
    this.highlighter.hide();
    document.removeEventListener("pointerdown", this.onOutsidePointer, true);
    this.host.remove();
  }

  open(): void {
    this.el.panel.hidden = false;
    this.el.launcher.setAttribute("aria-expanded", "true");
    this.el.reactions[0]?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.highlighter.hide();
    this.el.panel.hidden = true;
    this.el.launcher.setAttribute("aria-expanded", "false");
    this.el.launcher.focus();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private onOutsidePointer = (event: Event) => {
    // composedPath() sees through the shadow boundary; event.target alone
    // would just be the host element for clicks inside the widget.
    if (this.isOpen && !this.picker.active && !event.composedPath().includes(this.host)) {
      this.close();
    }
  };

  /** Hide the panel, let the visitor point at something, then come back. */
  private async pickTarget(): Promise<void> {
    this.el.panel.hidden = true;
    const picked = await this.picker.pick();
    this.el.panel.hidden = false;
    if (picked) {
      this.target = picked.target;
      this.targetElement = picked.element;
    }
    this.refresh();
    (picked ? this.el.message : this.el.point).focus();
  }

  private showTarget(options: { scroll?: boolean } = {}): void {
    const el = this.findTarget();
    if (!el) return;
    if (options.scroll) {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }
    this.highlighter.show(el);
  }

  /** The picked element, or its replacement if the page re-rendered it. */
  private findTarget(): Element | null {
    if (this.targetElement?.isConnected) return this.targetElement;
    if (!this.target) return null;
    try {
      return document.querySelector(this.target.selector);
    } catch {
      return null;
    }
  }

  private pickReaction(reaction: Reaction): void {
    this.reaction = this.reaction === reaction ? undefined : reaction;
    this.refresh();
  }

  private refresh(): void {
    for (const button of this.el.reactions) {
      button.setAttribute("aria-pressed", String(button.dataset.reaction === this.reaction));
    }
    const hasContent = this.reaction !== undefined || this.el.message.value.trim().length > 0;
    this.el.send.disabled = this.sending || !hasContent;
    this.el.send.textContent = this.sending ? "Sending…" : "Send";
    this.el.point.setAttribute("aria-pressed", String(this.target !== undefined));
    this.el.chip.hidden = this.target === undefined;
    if (this.target) {
      this.el.chipLabel.textContent = this.target.text ? `“${this.target.text}”` : "Picked element";
    }
  }

  private setStatus(text: string, tone: "info" | "error" = "info"): void {
    this.el.status.textContent = text;
    this.el.status.dataset.tone = tone;
  }

  private async submit(): Promise<void> {
    if (this.el.send.disabled) return;
    this.sending = true;
    this.setStatus("");
    this.refresh();

    const ok = await this.onSubmit({
      reaction: this.reaction,
      message: this.el.message.value.trim() || undefined,
      target: this.target,
      hp: this.el.hp.value || undefined,
    });

    this.sending = false;
    if (ok) {
      this.el.form.hidden = true;
      this.el.thanks.hidden = false;
      this.resetTimer = setTimeout(() => {
        this.close();
        this.reset();
      }, 2500);
    } else {
      this.setStatus("Couldn't send that. Try again?", "error");
    }
    this.refresh();
  }

  private reset(): void {
    this.reaction = undefined;
    this.target = undefined;
    this.targetElement = null;
    this.el.message.value = "";
    this.el.form.hidden = false;
    this.el.thanks.hidden = true;
    this.setStatus("");
    this.refresh();
  }
}

function template(position: WidgetOptions["position"]): string {
  const reactions = REACTIONS.map(
    (r) =>
      `<button type="button" class="reaction" data-reaction="${r}" aria-pressed="false" ` +
      `aria-label="${REACTION_LABELS[r]}" title="${REACTION_LABELS[r]}">${REACTION_EMOJI[r]}</button>`,
  ).join("");

  return `<style>${STYLES}</style>
<div class="flooper" data-position="${position}">
  <div class="panel" id="flooper-panel" role="dialog" aria-labelledby="flooper-title" hidden>
    <form novalidate>
      <p class="title" id="flooper-title"></p>
      <div class="reactions" role="group" aria-label="Quick reaction">${reactions}</div>
      <label class="sr-only" for="flooper-message">Your note</label>
      <div class="message">
        <textarea id="flooper-message" rows="3" maxlength="${LIMITS.messageMaxLength}"
          placeholder="${EXAMPLE_MESSAGE}" aria-describedby="flooper-autofill"></textarea>
        <div class="ghost" aria-hidden="true">
          <span class="ghost-text">${EXAMPLE_MESSAGE}</span>
          <kbd class="autofill-hint">${ICONS.arrowRight}</kbd>
        </div>
      </div>
      <span class="sr-only" id="flooper-autofill">Press the right arrow key to use the example message.</span>
      <div class="target-chip" hidden>
        <button type="button" class="target-text" title="Show it on the page">
          ${ICONS.element}<span class="target-label"></span>
        </button>
        <button type="button" class="target-clear" aria-label="Remove the picked element"
          title="Remove">${ICONS.close}</button>
      </div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="footer">
        <button type="button" class="point" aria-pressed="false"
          aria-label="Point at something on the page" title="Point at something on the page">${ICONS.pick}</button>
        <span class="status" role="status" aria-live="polite"></span>
        <button type="submit" class="send">Send</button>
      </div>
    </form>
    <div class="thanks" role="status" hidden>
      <strong>${ICONS.heart} Thanks!</strong>
      <span>The dev will see this soon.</span>
    </div>
  </div>
  <button type="button" class="launcher" aria-label="Leave feedback" aria-expanded="false"
    aria-controls="flooper-panel">${LOGO_SVG}</button>
</div>
<div class="highlight" hidden><span class="highlight-label"></span></div>
<div class="pick-layer" hidden>
  <div class="pick-bar" role="status">Selecting an element
    <button type="button" class="pick-cancel">Cancel</button>
  </div>
</div>`;
}
