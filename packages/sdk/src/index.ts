import type { FeedbackSubmission } from "@flooper/shared/schemas";
import { submitFeedback } from "./api";
import { collectContext, uuid } from "./context";
import type { FlooperInstance, FlooperOptions, Metadata, Visitor } from "./types";
import { Widget } from "./ui/widget";

export type {
  FlooperInstance,
  FlooperOptions,
  Metadata,
  Visitor,
} from "./types";
export const version: string = __SDK_VERSION__;

let current: FlooperInstance | null = null;

/** Add the feedback button to the page. Safe to call more than once. */
export function init(options: FlooperOptions): FlooperInstance {
  if (current) {
    console.warn("[flooper] init() was already called; returning the existing instance.");
    return current;
  }
  if (!options?.projectKey) throw new Error("[flooper] init() needs a projectKey");

  // During server-side rendering (Next.js, Astro...) there's no DOM. Return an
  // inert instance so importing the SDK there doesn't crash the server.
  if (typeof document === "undefined") return noopInstance;

  const apiUrl = (options.apiUrl ?? __DEFAULT_API_URL__).replace(/\/+$/, "");
  let visitor: Visitor | undefined = options.visitor;
  let metadata: Metadata | undefined = options.metadata;

  const widget = new Widget(
    {
      position: options.position ?? "bottom-right",
      theme: options.theme ?? "auto",
      title: options.title ?? "Leave a note for the dev!",
      // The API and the portal are one Worker, so its root is Flooper's home page.
      homeUrl: `${apiUrl}/`,
    },
    async (input) => {
      const payload: FeedbackSubmission = {
        idempotencyKey: uuid(),
        ...input,
        context: collectContext({
          captureQueryString: options.captureQueryString ?? false,
        }),
        visitor,
        metadata,
      };
      const result = await submitFeedback({
        apiUrl,
        projectKey: options.projectKey,
        payload,
      });
      if (!result.ok) console.warn(`[flooper] ${result.message}`);
      return result.ok;
    },
  );

  whenDomReady(() => {
    widget.mount();
    void widget.revealFromUrl();
  });

  current = {
    open: () => widget.open(),
    close: () => widget.close(),
    identify: (v) => {
      visitor = v;
    },
    setMetadata: (m) => {
      metadata = m;
    },
    destroy: () => {
      widget.destroy();
      current = null;
    },
  };
  return current;
}

const noopInstance: FlooperInstance = {
  open() {},
  close() {},
  identify() {},
  setMetadata() {},
  destroy() {},
};

function whenDomReady(fn: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}

// Script-tag usage: <script src=".../flooper.js" data-project-key="pk_..." defer></script>
// `document.currentScript` is only set while a classic script is first running,
// so this is a no-op for ES module imports and needs no opt-out.
if (typeof document !== "undefined") {
  const script = document.currentScript as HTMLScriptElement | null;
  const projectKey = script?.dataset.projectKey;
  if (projectKey) {
    init({
      projectKey,
      apiUrl: script.dataset.apiUrl,
      position: script.dataset.position as FlooperOptions["position"],
      theme: script.dataset.theme as FlooperOptions["theme"],
      title: script.dataset.title,
    });
  }
}
