import { describe, expect, it } from "vitest";
import { originFrom, siteNameFor } from "./SetupPanel";

describe("originFrom", () => {
  it("takes an address however it's typed", () => {
    expect(originFrom("myblog.com")).toBe("https://myblog.com");
    expect(originFrom("  https://www.myblog.com/blog/post?x=1 ")).toBe("https://www.myblog.com");
    expect(originFrom("http://myblog.com")).toBe("http://myblog.com");
    expect(originFrom("MyBlog.COM")).toBe("https://myblog.com");
  });

  it("uses http for local addresses", () => {
    expect(originFrom("localhost:3000")).toBe("http://localhost:3000");
    expect(originFrom("127.0.0.1:5174/page")).toBe("http://127.0.0.1:5174");
  });

  it("refuses what isn't a web address", () => {
    expect(originFrom("")).toBeNull();
    expect(originFrom("my blog")).toBeNull();
    expect(originFrom("myblog")).toBeNull();
    expect(originFrom("ftp://myblog.com")).toBeNull();
    expect(originFrom("javascript:alert(1)")).toBeNull();
  });
});

describe("siteNameFor", () => {
  it("names a site after its address", () => {
    expect(siteNameFor("https://www.myblog.com")).toBe("myblog.com");
    expect(siteNameFor("http://localhost:3000")).toBe("localhost:3000");
  });
});
