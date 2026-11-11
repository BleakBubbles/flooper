import { LIMITS, REACTION_EMOJI, REACTIONS, type Reaction } from "@flooper/shared";
import type { SubmitErrorCode, SubmitResult } from "../api";
import { Highlighter } from "../picker/highlight";
import { type PickedTarget, Picker } from "../picker/picker";
import { takeHighlightParam, waitForElement } from "../picker/show-me";
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
  launcher: boolean;
  theme: "auto" | "light" | "dark";
  title: string;
  /** The Flooper instance's home page, for the "Powered by" link. */
  homeUrl: string;
  /** Called when the panel opens (to ask the site's settings, once). */
  onOpen?: () => void;
  /** "Want to hear back?": attach the visitor's address to the note just sent. */
  onReply?: (id: string, email: string) => Promise<boolean>;
}

export interface WidgetInput {
  reaction?: Reaction;
  message?: string;
  target?: PickedTarget;
  hp?: string;
}

export type SubmitHandler = (input: WidgetInput) => Promise<SubmitResult>;

/**
 * What the visitor sees when a note can't be sent. Written for the visitor,
 * not the site's developer: they can't fix the site's setup, but they can
 * wait, check their connection, or try again. (The developer gets the exact
 * server message in the console.)
 */
const FAILURE_MESSAGES: Partial<Record<SubmitErrorCode, string>> = {
  network_error: "Couldn't connect. Check your connection and try again.",
  rate_limited: "That's a lot of notes! Try again in a minute.",
  site_limit_reached: "This site has had a lot of notes today. Try again tomorrow.",
  paused: "Notes are paused for a little while. Try again later.",
  origin_not_allowed: "Notes aren't switched on for this site yet.",
  not_found: "Notes aren't switched on for this site yet.",
  internal_error: "Something went wrong on our end. Try again?",
};
const DEFAULT_FAILURE = "Couldn't send that note. Try again?";

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
    sendLabel: HTMLElement;
    status: HTMLElement;
    reactions: HTMLButtonElement[];
    notice: HTMLElement;
    point: HTMLButtonElement;
    chip: HTMLElement;
    chipText: HTMLButtonElement;
    chipLabel: HTMLElement;
    chipClear: HTMLButtonElement;
    thanksText: HTMLElement;
    reply: HTMLFormElement;
    replyEmail: HTMLInputElement;
    replyButton: HTMLButtonElement;
  };
  private readonly picker: Picker;
  private readonly highlighter: Highlighter;
  private reaction: Reaction | undefined;
  private target: PickedTarget | undefined;
  /** The picked element itself, while it's still on the page. */
  private targetElement: Element | null = null;
  private sending = false;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly onOpen: (() => void) | undefined;
  private readonly onReply: WidgetOptions["onReply"];
  /** The site offers replies (asked when the panel first opens). */
  private replies = false;
  /** The note just sent, for "Want to hear back?". */
  private noteId = "";

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
      hp: $("[name=website]"),
      send: $(".send"),
      sendLabel: $(".send-label"),
      status: $(".status"),
      reactions: [...this.root.querySelectorAll<HTMLButtonElement>(".reaction")],
      notice: $(".notice"),
      point: $(".point"),
      chip: $(".target-chip"),
      chipText: $(".target-text"),
      chipLabel: $(".target-label"),
      chipClear: $(".target-clear"),
      thanksText: $(".thanks span"),
      reply: $(".reply"),
      replyEmail: $(".reply input"),
      replyButton: $(".reply button"),
    };
    this.onOpen = options.onOpen;
    this.onReply = options.onReply;
    this.highlighter = new Highlighter($(".highlight"), $(".highlight-label"));
    this.picker = new Picker(this.root, this.host, this.highlighter);
    // textContent, not innerHTML: the title comes from site config and must
    // never be interpreted as markup.
    $<HTMLElement>(".title").textContent = options.title;
    // Only ever a web page: the URL comes from config, so no javascript: links.
    const home = $<HTMLAnchorElement>(".powered");
    if (/^https?:\/\//.test(options.homeUrl)) home.href = options.homeUrl;
    else home.removeAttribute("href");

    this.el.launcher.hidden = !options.launcher;
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
    // Notify me waits for something that looks like an address.
    this.el.replyEmail.addEventListener("input", () => this.checkReply());
    this.el.reply.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.sendReply();
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
    this.onOpen?.();
    this.el.panel.hidden = false;
    this.el.launcher.setAttribute("aria-expanded", "true");
    this.el.reactions[0]?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    // Closed after sending: start fresh next time.
    if (this.el.form.hidden) {
      clearTimeout(this.resetTimer);
      this.reset();
    }
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

  /**
   * The site lets visitors ask to hear back: offer it after they send, with
   * their address filled in if the site identified them.
   */
  offerReplies(email?: string): void {
    this.replies = true;
    if (email && !this.el.replyEmail.value) this.el.replyEmail.value = email;
  }

  private checkReply(): void {
    this.el.replyButton.disabled = !this.el.replyEmail.checkValidity();
  }

  private async sendReply(): Promise<void> {
    // Enter can't get here early: a form won't submit while its button is
    // disabled, and the field is required and type="email".
    const button = this.el.replyButton;
    button.disabled = true;
    const ok = await this.onReply?.(this.noteId, this.el.replyEmail.value.trim());
    button.disabled = false;
    if (ok) {
      this.el.reply.hidden = true;
      this.el.thanksText.textContent = "We'll email you if there's news.";
      this.resetTimer = setTimeout(() => this.close(), 2500);
    } else {
      button.textContent = "Try again";
    }
  }

  private showTarget(options: { scroll?: boolean } = {}): void {
    const el = this.findTarget();
    if (!el) return;
    if (options.scroll) scrollToCenter(el);
    this.highlighter.show(el);
  }

  /**
   * If the page was opened from a "Show me" link in the portal, scroll to the
   * element the feedback pointed at and outline it until the visitor clicks,
   * presses a key, or ten seconds pass.
   */
  async revealFromUrl(): Promise<void> {
    const selector = takeHighlightParam();
    if (!selector) return;
    const el = await waitForElement(selector);
    if (!el) {
      this.notify("Couldn't find that element on this page anymore.");
      return;
    }
    scrollToCenter(el);
    this.highlighter.show(el, "Feedback pointed here");
    const dismiss = () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
      this.highlighter.hide();
    };
    const timer = setTimeout(dismiss, 10_000);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", dismiss, true);
  }

  /** A short message at the top of the page that fades after a few seconds. */
  private notify(text: string): void {
    this.el.notice.textContent = text;
    this.el.notice.hidden = false;
    setTimeout(() => {
      this.el.notice.hidden = true;
    }, 5000);
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
    this.el.sendLabel.textContent = this.sending ? "Sending…" : "Send";
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

    const result = await this.onSubmit({
      reaction: this.reaction,
      message: this.el.message.value.trim() || undefined,
      target: this.target,
      hp: this.el.hp.value || undefined,
    });

    this.sending = false;
    if (result.ok) {
      this.el.form.hidden = true;
      this.el.thanks.hidden = false;
      this.noteId = result.id;
      // Sites that offer replies ask "Want to hear back?" and wait for an answer.
      if (this.replies && this.onReply) {
        this.el.reply.hidden = false;
        this.checkReply();
      } else this.resetTimer = setTimeout(() => this.close(), 2500);
    } else {
      this.setStatus(FAILURE_MESSAGES[result.code] ?? DEFAULT_FAILURE, "error");
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
    this.el.thanksText.textContent = SENT;
    this.el.reply.hidden = true;
    this.el.replyButton.textContent = NOTIFY;
    this.setStatus("");
    this.refresh();
  }
}

/** Bring an element to the middle of the screen, gently unless motion is reduced. */
function scrollToCenter(el: Element): void {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

const SENT = "The dev will see this soon.";
const NOTIFY = "Notify me";

function template(position: WidgetOptions["position"]): string {
  const reactions = REACTIONS.map(
    (r) =>
      `<button type="button" class="reaction" data-reaction="${r}" aria-pressed="false" ` +
      `aria-label="${REACTION_LABELS[r]}" data-tooltip="${REACTION_LABELS[r]}">${REACTION_EMOJI[r]}</button>`,
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
        <button type="button" class="target-text">
          ${ICONS.element}<span class="target-label"></span>
        </button>
        <button type="button" class="target-clear" aria-label="Remove the picked element"
          data-tooltip="Remove">${ICONS.close}</button>
      </div>
      <input class="sr-only" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="footer">
        <button type="button" class="btn point" aria-pressed="false"
          aria-label="Point at something on the page" data-tooltip="Point at something">${ICONS.pick}</button>
        <span class="status" role="status" aria-live="polite"></span>
        <button type="submit" class="btn primary send"><span class="send-label">Send</span>${ICONS.send}</button>
      </div>
    </form>
    <div class="thanks" role="status" hidden>
      <strong>${ICONS.heart} Thanks!</strong>
      <span>${SENT}</span>
    </div>
    <form class="reply" hidden>
      <label for="flooper-reply"><strong>Want to hear back?</strong></label>
      <div class="footer">
        <input id="flooper-reply" type="email" maxlength="254" autocomplete="email" required
          placeholder="you@example.com">
        <button class="btn primary">${NOTIFY}</button>
      </div>
    </form>
    <a class="powered" target="_blank" rel="noopener">Powered by <strong>Flooper</strong></a>
  </div>
  <button type="button" class="launcher" aria-label="Leave feedback" aria-expanded="false"
    aria-controls="flooper-panel">${LOGO_SVG}</button>
</div>
<div class="highlight" hidden><span class="highlight-label"></span></div>
<div class="notice" role="status" hidden></div>
<div class="pick-layer" hidden>
  <div class="pick-bar" role="status">Selecting an element
    <button type="button" class="btn small pick-cancel">Cancel</button>
  </div>
</div>`;
}
