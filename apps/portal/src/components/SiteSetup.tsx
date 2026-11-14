import type { Project } from "@flooper/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { api, keys } from "../api";
import { usePref } from "../prefs";
import { FieldErrors } from "./FieldErrors";
import {
  CornerLeftIcon,
  CornerRightIcon,
  MonitorIcon,
  MoonIcon,
  ReopenIcon,
  SunIcon,
} from "./icons";

// The pieces of connecting a site, shared by its setup steps (first run) and
// its settings (later changes).

/**
 * How the widget looks and opens on a site: the options its script tag takes
 * (data-position, data-theme, data-title, data-launcher). They live in the
 * snippet, not on Flooper's servers, so they cost the widget nothing on each
 * page view; the app just helps write the tag.
 */
export interface WidgetOptions {
  position: "bottom-right" | "bottom-left";
  theme: "auto" | "light" | "dark";
  /** The panel's heading; empty for the default. */
  title: string;
  /** false: no floating button; the site opens it with Flooper.open(). */
  launcher: boolean;
}

export const DEFAULT_WIDGET: WidgetOptions = {
  position: "bottom-right",
  theme: "auto",
  title: "",
  launcher: true,
};

/** The widget's own default title, shown as the title field's placeholder. */
export const DEFAULT_TITLE = "Leave a note for the dev:";

function isWidgetOptions(value: unknown): value is WidgetOptions {
  const v = value as Partial<WidgetOptions> | null;
  return (
    !!v &&
    (v.position === "bottom-right" || v.position === "bottom-left") &&
    (v.theme === "auto" || v.theme === "light" || v.theme === "dark") &&
    typeof v.title === "string" &&
    typeof v.launcher === "boolean"
  );
}

/** Whether two sets of options give the same snippet. */
export function sameWidget(a: WidgetOptions, b: WidgetOptions): boolean {
  return (
    snippetFor({ publicKey: "" } as Project, a) === snippetFor({ publicKey: "" } as Project, b)
  );
}

/**
 * A site's widget options as its snippet has them (remembered in this
 * browser, so the snippet stays the same), and whether the snippet changed
 * since it was last copied: the site still has the old one until it is.
 */
export function useWidgetSnippet(projectId: string) {
  const [options, setOptions] = usePref<WidgetOptions>(
    `widget:${projectId}`,
    DEFAULT_WIDGET,
    isWidgetOptions,
  );
  const [changed, setChanged] = usePref<boolean>(
    `widget-changed:${projectId}`,
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  // Switching to your own button adds a step: the button's onclick, copied
  // on its own (copying the snippet doesn't count for it).
  const [buttonChanged, setButtonChanged] = usePref<boolean>(
    `widget-button-changed:${projectId}`,
    false,
    (v): v is boolean => typeof v === "boolean",
  );
  // Everything just got copied: a "done" until the page is left. Kept by site,
  // so another site's settings don't show it.
  const [doneFor, setDoneFor] = useState<string | null>(null);
  return {
    options,
    /** New options for the snippet: it needs copying to the site again. */
    update: (next: WidgetOptions) => {
      if (options.launcher && !next.launcher) setButtonChanged(true);
      if (next.launcher) setButtonChanged(false);
      setOptions(next);
      setChanged(true);
      setDoneFor(null);
    },
    changed,
    /** The new snippet was copied. */
    copied: () => {
      if (changed && !buttonChanged) setDoneFor(projectId);
      setChanged(false);
    },
    /** The own-button example still needs copying. */
    buttonChanged,
    buttonCopied: () => {
      if (buttonChanged && !changed) setDoneFor(projectId);
      setButtonChanged(false);
    },
    /** The last of the changes was just copied. */
    done: doneFor === projectId,
  };
}

/** Text safe inside a double-quoted HTML attribute. */
function attr(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The <script> tag for a site, with its widget options (only those that
 * aren't the default). The portal, API and SDK share this origin.
 */
export function snippetFor(project: Project, options: WidgetOptions = DEFAULT_WIDGET): string {
  const origin = window.location.origin;
  const lines = [
    `src="${origin}/sdk/flooper.js"`,
    `data-project-key="${project.publicKey}"`,
    `data-api-url="${origin}"`,
  ];
  // A corner only for the floating button; a site's own button has none.
  if (options.launcher && options.position !== DEFAULT_WIDGET.position) {
    lines.push(`data-position="${options.position}"`);
  }
  if (options.theme !== DEFAULT_WIDGET.theme) lines.push(`data-theme="${options.theme}"`);
  const title = options.title.trim();
  if (title) lines.push(`data-title="${attr(title)}"`);
  if (!options.launcher) lines.push(`data-launcher="false"`);
  return `<script\n${[...lines, "defer"].map((l) => `  ${l}`).join("\n")}\n></script>`;
}

/** `onCopy` fires once the snippet is copied (or selected for copying). */
export function Snippet({
  project,
  options,
  onCopy,
  attention = false,
}: {
  project: Project;
  options?: WidgetOptions;
  onCopy?: () => void;
  /** It changed since it was last copied: its Copy button stands out. */
  attention?: boolean;
}) {
  return (
    <CodeBlock
      code={snippetFor(project, options)}
      what="Snippet"
      onCopy={onCopy}
      attention={attention}
    />
  );
}

/** Code to paste somewhere, with a Copy button. */
export function CodeBlock({
  code,
  what = "Code",
  onCopy,
  attention = false,
}: {
  code: string;
  /** For screen readers: "<what> copied". */
  what?: string;
  onCopy?: () => void;
  attention?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");
  const pre = useRef<HTMLPreElement>(null);
  const snippet = code;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setState("copied");
    } catch {
      // Clipboard access can be refused (permissions, embedded frames). Select
      // the text instead, so a Ctrl/Cmd+C finishes the job.
      if (pre.current) window.getSelection()?.selectAllChildren(pre.current);
      setState("selected");
    }
    onCopy?.();
    setTimeout(() => setState("idle"), 2500);
  }

  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C";
  const label = {
    idle: "Copy",
    copied: "Copied",
    selected: `Press ${shortcut}`,
  }[state];

  return (
    <div className="code-block">
      <pre className="code" ref={pre}>
        {snippet}
      </pre>
      <button
        type="button"
        className={attention ? "copy-button attention" : "copy-button"}
        onClick={copy}
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {label}
      </button>
      {/* Announce the result to screen readers, since the button text alone may not be re-read. */}
      <span className="sr-only" role="status">
        {state === "copied" ? `${what} copied` : state === "selected" ? `${what} selected` : ""}
      </span>
    </div>
  );
}

/** For a site with its own button or link: an example of one that opens the widget. */
export const OPEN_SNIPPET = `<button onclick="Flooper.open()">Feedback</button>`;

/**
 * The widget's options for a site, one compact row each, beside a sketch of
 * the result: the panel in its colors with its title, above the button in its
 * corner (or the site's own button in its header). Changes are a draft, shown
 * in the sketch, until "Update snippet" puts them in the site's snippet.
 */
export function WidgetOptionsForm({
  applied,
  onUpdate,
  idPrefix,
}: {
  /** The options the snippet has now. */
  applied: WidgetOptions;
  onUpdate: (options: WidgetOptions) => void;
  idPrefix: string;
}) {
  const [options, setOptions] = useState(applied);
  // Each change on top of the latest draft, so quick ones all stick.
  const set = (patch: Partial<WidgetOptions>) => setOptions((draft) => ({ ...draft, ...patch }));
  const unchanged = sameWidget(options, applied);
  return (
    <div className="widget-options">
      <div className="widget-option-rows">
        {/* One question, where the button goes: a corner of the page, or the
            site's own button (then the corner doesn't apply). */}
        <span className="widget-option-name">Button</span>
        <Segmented
          label="Button"
          value={options.launcher ? options.position : "own"}
          options={[
            {
              value: "bottom-left",
              icon: <CornerLeftIcon />,
              text: "Left",
              withText: true,
            },
            {
              value: "bottom-right",
              icon: <CornerRightIcon />,
              text: "Right",
              withText: true,
            },
            { value: "own", text: "Your own" },
          ]}
          onChange={(v) =>
            set(
              v === "own"
                ? { launcher: false }
                : { launcher: true, position: v as WidgetOptions["position"] },
            )
          }
        />
        <span className="widget-option-name">Colors</span>
        <Segmented
          label="Colors"
          value={options.theme}
          options={[
            {
              value: "auto",
              icon: <MonitorIcon />,
              text: "Match the visitor's system",
            },
            { value: "light", icon: <SunIcon />, text: "Light" },
            { value: "dark", icon: <MoonIcon />, text: "Dark" },
          ]}
          onChange={(v) => set({ theme: v as WidgetOptions["theme"] })}
        />
        <label className="widget-option-name" htmlFor={`${idPrefix}-title`}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          className="widget-title-input"
          maxLength={80}
          placeholder={DEFAULT_TITLE}
          value={options.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="widget-actions">
          <button
            type="button"
            className="btn primary"
            disabled={unchanged}
            onClick={() => onUpdate({ ...options, title: options.title.trim() })}
          >
            Update snippet
          </button>
          {/* Always there (hidden until there's something to undo), so the
              section keeps its height. */}
          <button
            type="button"
            className={unchanged ? "icon-button widget-undo hidden" : "icon-button widget-undo"}
            onClick={() => setOptions(applied)}
            disabled={unchanged}
            aria-hidden={unchanged}
            aria-label="Undo changes"
            data-tooltip="Undo changes"
          >
            <ReopenIcon />
          </button>
        </div>
      </div>
      <WidgetPreview options={options} />
    </div>
  );
}

/**
 * A few choices as one pill of buttons, like the app's theme picker: words,
 * or icons with their words as tooltips.
 */
function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  /** An icon alone (its words as a tooltip), words alone, or both (withText). */
  options: {
    value: string;
    text: string;
    icon?: ReactNode;
    withText?: boolean;
  }[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="segmented">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const iconOnly = o.icon && !o.withText;
        return (
          <button
            key={o.value}
            type="button"
            className={iconOnly ? "icon-button" : "segmented-text"}
            aria-pressed={value === o.value}
            aria-label={iconOnly ? o.text : undefined}
            data-tooltip={iconOnly ? o.text : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            {iconOnly ? null : o.text}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * A sketch of a page with the widget open: its panel in the colors picked
 * (half light, half dark for "match the system") with its title, over the
 * button in its corner, or the site's own button in its header. Only what an
 * option changes moves: the panel stays where it is for your own button.
 */
function WidgetPreview({ options }: { options: WidgetOptions }) {
  const side = options.launcher ? options.position : "bottom-right";
  return (
    <div className="widget-preview" aria-hidden="true">
      <div className="widget-preview-bar">
        <span className="widget-preview-line" />
        <span className={`widget-preview-own${options.launcher ? " hidden" : ""}`}>Feedback</span>
      </div>
      <span className="widget-preview-line" />
      <span className="widget-preview-line short" />
      <div className={`widget-preview-panel ${side} ${options.theme}`}>
        <span className="widget-preview-title">{options.title.trim() || DEFAULT_TITLE}</span>
        <span className="widget-preview-tiles">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="widget-preview-box" />
      </div>
      {options.launcher && (
        <span className={`widget-preview-launcher ${options.position}`}>
          <img src="/logo.svg" alt="" />
        </span>
      )}
    </div>
  );
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CopyIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" {...iconProps}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Edit the addresses the widget may run on, one per line. */
export function OriginsForm({ project, onSaved }: { project: Project; onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const [origins, setOrigins] = useState(project.allowedOrigins.join("\n"));
  const save = useMutation({
    mutationFn: (allowedOrigins: string[]) => api.updateProject(project.id, { allowedOrigins }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.project(project.id), updated);
      queryClient.invalidateQueries({ queryKey: keys.projects });
      setOrigins(updated.allowedOrigins.join("\n"));
      onSaved?.();
    },
  });
  const unchanged = origins.trim() === project.allowedOrigins.join("\n");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(origins.split(/\s+/).filter(Boolean));
  }

  return (
    <form onSubmit={onSubmit} className="origins-form">
      <label htmlFor={`origins-${project.id}`} className="sr-only">
        Allowed addresses, one per line
      </label>
      <textarea
        id={`origins-${project.id}`}
        className="mono"
        rows={Math.max(2, origins.split("\n").length)}
        placeholder="https://mysite.com"
        value={origins}
        onChange={(e) => setOrigins(e.target.value)}
      />
      <FieldErrors error={save.error} />
      <div className="row-inline">
        <button type="submit" className="btn primary" disabled={save.isPending || unchanged}>
          {save.isPending ? "Saving…" : "Save"}
        </button>
        {save.isSuccess && unchanged && <span className="muted small">Saved</span>}
      </div>
    </form>
  );
}
