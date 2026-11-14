import type { Project } from "@flooper/shared/schemas";
import { describe, expect, it } from "vitest";
import { DEFAULT_WIDGET, sameWidget, snippetFor } from "./SiteSetup";

const project = { publicKey: "pk_test" } as Project;
const origin = window.location.origin;

describe("snippetFor", () => {
  it("is just the key and address with the default options", () => {
    expect(snippetFor(project)).toBe(
      `<script
  src="${origin}/sdk/flooper.js"
  data-project-key="pk_test"
  data-api-url="${origin}"
  defer
></script>`,
    );
    expect(snippetFor(project, DEFAULT_WIDGET)).toBe(snippetFor(project));
  });

  it("adds an attribute for each option that isn't the default", () => {
    const options = {
      position: "bottom-left",
      theme: "dark",
      title: "  Found a bug?  ",
      launcher: true,
    } as const;
    const snippet = snippetFor(project, options);
    expect(snippet).toContain(`  data-position="bottom-left"\n`);
    expect(snippet).toContain(`  data-theme="dark"\n`);
    expect(snippet).toContain(`  data-title="Found a bug?"\n`);
    expect(snippet.endsWith(`  defer\n></script>`)).toBe(true);

    // The site's own button: no floating one, so no corner either.
    const own = snippetFor(project, { ...options, launcher: false });
    expect(own).toContain(`  data-launcher="false"\n`);
    expect(own).not.toContain("data-position");
  });

  it("keeps a title's quotes and brackets from breaking the tag", () => {
    const snippet = snippetFor(project, { ...DEFAULT_WIDGET, title: `Say "hi" <b>&</b>` });
    expect(snippet).toContain(`data-title="Say &quot;hi&quot; &lt;b&gt;&amp;&lt;/b&gt;"`);
  });
});

describe("sameWidget", () => {
  it("is the same when the snippet would be, so Update snippet stays off", () => {
    expect(sameWidget(DEFAULT_WIDGET, { ...DEFAULT_WIDGET })).toBe(true);
    // A title of spaces is no title; the corner doesn't matter with your own button.
    expect(sameWidget(DEFAULT_WIDGET, { ...DEFAULT_WIDGET, title: "   " })).toBe(true);
    const own = { ...DEFAULT_WIDGET, launcher: false };
    expect(sameWidget(own, { ...own, position: "bottom-left" })).toBe(true);
    // Anything that changes the snippet counts.
    expect(sameWidget(DEFAULT_WIDGET, { ...DEFAULT_WIDGET, theme: "dark" })).toBe(false);
    expect(sameWidget(DEFAULT_WIDGET, own)).toBe(false);
  });
});
