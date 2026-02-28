import { describe, it, expect } from "vitest";
import { buildUrl } from "./http";

describe("buildUrl", () => {
  it("无参数时返回原 URL", () => {
    expect(buildUrl("https://api.example.com", {})).toBe(
      "https://api.example.com"
    );
  });

  it("添加单个参数", () => {
    expect(buildUrl("https://api.example.com", { foo: "bar" })).toBe(
      "https://api.example.com?foo=bar"
    );
  });

  it("添加多个参数", () => {
    expect(
      buildUrl("https://api.example.com", { a: "1", b: "2" })
    ).toMatch(/a=1.*b=2|b=2.*a=1/);
  });

  it("URL 已有查询字符串时追加", () => {
    const result = buildUrl("https://api.example.com?x=1", { y: "2" });
    expect(result).toContain("x=1");
    expect(result).toContain("y=2");
  });

  it("过滤空 key", () => {
    expect(
      buildUrl("https://api.example.com", { "": "ignored", foo: "bar" } as Record<string, string>)
    ).toBe("https://api.example.com?foo=bar");
  });
});
