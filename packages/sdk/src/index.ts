import type { FeedbackSubmission } from "@flooper/shared/schemas";
import { type SubmitErrorCode, submitFeedback } from "./api";
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
  const ingestUrl = `${apiUrl}/api/v1/ingest/${encodeURIComponent(options.projectKey)}`;
  let visitor: Visitor | undefined = options.visitor;
  let metadata: Metadata | undefined = options.metadata;
  let asked = false;

  const widget = new Widget(
    {
      position: options.position ?? "bottom-right",
      launcher: options.launcher ?? true,
      theme: options.theme ?? "auto",
      title: options.title ?? "Leave a note for the dev",
      // The API and the portal are one Worker, so its root is Flooper's home page.
      homeUrl: `${apiUrl}/`,
      // The first time the panel opens: does this site offer replies?
      onOpen: () => {
        if (asked) return;
        asked = true;
        fetch(`${ingestUrl}/config`)
          .then((res) => res.json())
          .then((config: { replies?: boolean }) => {
            if (config.replies) widget.offerReplies(visitor?.email);
          })
          .catch(() => {});
      },
      // Sent as plain text (the API reads JSON either way), so the browser
      // doesn't need a preflight first.
      onReply: (id, email) =>
        fetch(`${ingestUrl}/feedback/${id}/reply`, {
          method: "POST",
          body: JSON.stringify({ email }),
          credentials: "omit",
        }).then(
          (res) => res.ok,
          () => false,
        ),
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
      if (!result.ok) console.warn(`[flooper] ${result.message}${setupHint(result.code)}`);
      return result;
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

/** For the site's developer: how to fix a refusal that comes from setup. */
function setupHint(code: SubmitErrorCode): string {
  if (code === "origin_not_allowed") {
    return `. Add ${location.origin} under Site settings in the Flooper portal.`;
  }
  if (code === "not_found") return ". Check the project key in your Flooper snippet.";
  return "";
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
      launcher: script.dataset.launcher !== "false",
      theme: script.dataset.theme as FlooperOptions["theme"],
      title: script.dataset.title,
    });
  }
}
