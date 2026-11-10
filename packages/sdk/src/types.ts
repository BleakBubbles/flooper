// The SDK's public types. These are what users see in their editor, so they're
// defined here, self-contained, rather than re-exported from internal packages.

export interface FlooperOptions {
  /** Your project's public key from the Flooper portal (starts with `pk_`). */
  projectKey: string;
  /** Where the Flooper API lives. You only need this when self-hosting. */
  apiUrl?: string;
  /** Which corner the button sits in. Default: `"bottom-right"`. */
  position?: "bottom-right" | "bottom-left";
  /**
   * Show the floating button. Default `true`. Set `false` to open the widget
   * only from your own button, with `open()`.
   */
  launcher?: boolean;
  /** Default `"auto"` follows the visitor's light/dark preference. */
  theme?: "auto" | "light" | "dark";
  /** The heading shown at the top of the panel. */
  title?: string;
  /** Who the visitor is, if your site knows. */
  visitor?: Visitor;
  /** Extra key/values attached to every submission, e.g. `{ plan: "free" }`. */
  metadata?: Metadata;
  /**
   * Include the page's query string in the captured URL. Off by default,
   * because query strings sometimes contain tokens or personal data.
   */
  captureQueryString?: boolean;
}

export interface Visitor {
  id?: string;
  email?: string;
  name?: string;
}

export type Metadata = Record<string, string | number | boolean>;

export interface FlooperInstance {
  open(): void;
  close(): void;
  /** Attach (or update) who the visitor is, e.g. after they log in. */
  identify(visitor: Visitor | undefined): void;
  setMetadata(metadata: Metadata | undefined): void;
  /** Remove the widget from the page entirely. */
  destroy(): void;
}
