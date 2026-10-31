import { LIMITS, REACTION_EMOJI, REACTIONS, type Reaction } from "@flooper/shared";
import { LOGO_SVG } from "./icon";
import { STYLES } from "./styles";

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
  };
  private reaction: Reaction | undefined;
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
    };
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
    this.el.form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.root.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape") this.close();
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
    if (this.isOpen && !event.composedPath().includes(this.host)) this.close();
  };

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
      <textarea id="flooper-message" rows="3" maxlength="${LIMITS.messageMaxLength}"
        placeholder="Anything on your mind? (optional)"></textarea>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="footer">
        <span class="status" role="status" aria-live="polite"></span>
        <button type="submit" class="send">Send</button>
      </div>
    </form>
    <div class="thanks" role="status" hidden>
      <strong>Thanks! 💛</strong>
      <span>The dev will see this soon.</span>
    </div>
  </div>
  <button type="button" class="launcher" aria-label="Leave feedback" aria-expanded="false"
    aria-controls="flooper-panel">${LOGO_SVG}</button>
</div>`;
}
