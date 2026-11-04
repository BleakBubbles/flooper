import { beforeEach, describe, expect, it } from "vitest";
import { cssSelector, resolveTarget, textSnippet } from "./selector";

// A small page with the kinds of structure real sites have: repeated siblings,
// ids (stable and generated), test ids, links with nested markup, icons, forms.
const PAGE = `
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/projects"><span>Pro<strong>jects</strong></span></a>
      <button><svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg></button>
    </nav>
  </header>
  <main>
    <section id="about">
      <h2>About</h2>
      <p>First paragraph.</p>
      <p>Second <em>paragraph</em> with a <a href="#">link</a>.</p>
    </section>
    <section id=":r3:">
      <ul>
        <li>One</li><li>Two</li><li>Three</li>
      </ul>
    </section>
    <div data-testid="pricing">
      <div><div><p>Nested deep</p></div></div>
    </div>
    <form>
      <input name="email" aria-label="Your email">
      <textarea>default text</textarea>
    </form>
    <div data-flooper-ignore><p>Private stuff</p></div>
    <img src="x.png" alt="A cat">
  </main>
`;

beforeEach(() => {
  document.body.innerHTML = PAGE;
});

describe("cssSelector", () => {
  it("finds every element again, uniquely (round trip)", () => {
    for (const el of document.body.querySelectorAll("*")) {
      const selector = cssSelector(el);
      const matches = document.querySelectorAll(selector);
      expect(matches, selector).toHaveLength(1);
      expect(matches[0], selector).toBe(el);
    }
  });

  it("anchors on stable ids and test ids", () => {
    expect(cssSelector(document.querySelector("#about h2") as Element)).toBe("#about > h2");
    const deep = document.querySelector('[data-testid="pricing"] p') as Element;
    expect(cssSelector(deep)).toBe('[data-testid="pricing"] > div > div > p');
  });

  it("ignores generated ids", () => {
    const li = document.querySelectorAll("li")[1] as Element;
    expect(cssSelector(li)).toBe("body > main > section:nth-of-type(2) > ul > li:nth-of-type(2)");
  });
});

describe("resolveTarget", () => {
  it("moves from inline text to the link that contains it", () => {
    const strong = document.querySelector("nav strong") as Element;
    expect(resolveTarget(strong)).toBe(document.querySelectorAll("nav a")[1]);
  });

  it("moves from an icon's shapes to the button", () => {
    const path = document.querySelector("path") as Element;
    expect(resolveTarget(path)).toBe(document.querySelector("nav button"));
  });

  it("moves from emphasis to its paragraph", () => {
    const em = document.querySelector("em") as Element;
    expect(resolveTarget(em)).toBe(document.querySelectorAll("#about p")[1]);
  });

  it("refuses ignored regions and the page itself", () => {
    expect(resolveTarget(document.querySelector("[data-flooper-ignore] p") as Element)).toBeNull();
    expect(resolveTarget(document.body)).toBeNull();
  });
});

describe("textSnippet", () => {
  it("collapses whitespace", () => {
    expect(textSnippet(document.querySelectorAll("nav a")[1] as Element)).toBe("Projects");
  });

  it("prefers labels and alt text", () => {
    expect(textSnippet(document.querySelector("input") as Element)).toBe("Your email");
    expect(textSnippet(document.querySelector("img") as Element)).toBe("A cat");
  });

  it("never includes what a visitor typed", () => {
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "my secret";
    expect(textSnippet(textarea.closest("form") as Element)).not.toContain("secret");
  });

  it("truncates long text", () => {
    const p = document.querySelector("#about p") as Element;
    p.textContent = "word ".repeat(50);
    expect(textSnippet(p)?.length).toBe(100);
  });
});
