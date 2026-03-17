import { describe, it, expect } from "vitest";
import { buildUrl, buildDisplayUrl, parseUrlToBaseAndParams } from "./http";

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

describe("buildDisplayUrl", () => {
  it("[0] 等字符保持原样不编码", () => {
    expect(buildDisplayUrl("https://api.example.com", { arr: "[0]" })).toBe(
      "https://api.example.com?arr=[0]"
    );
  });

  it("& 和 = 会被编码", () => {
    expect(buildDisplayUrl("https://api.example.com", { "a&b": "c=d" })).toBe(
      "https://api.example.com?a%26b=c%3Dd"
    );
  });
});

describe("parseUrlToBaseAndParams", () => {
  it("解析无查询串的 URL", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com/path");
    expect(r.base).toBe("https://api.example.com/path");
    expect(r.params).toEqual([]);
  });

  it("解析带单个参数的 URL", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com?foo=bar");
    expect(r.base).toBe("https://api.example.com");
    expect(r.params).toEqual([{ key: "foo", value: "bar" }]);
  });

  it("解析带 path 的 URL", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com/path?foo=bar");
    expect(r.base).toBe("https://api.example.com/path");
    expect(r.params).toEqual([{ key: "foo", value: "bar" }]);
  });

  it("解析带多个参数的 URL", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com?a=1&b=2");
    expect(r.base).toBe("https://api.example.com");
    expect(r.params).toHaveLength(2);
    expect(r.params).toContainEqual({ key: "a", value: "1" });
    expect(r.params).toContainEqual({ key: "b", value: "2" });
  });

  it("无效 URL 时返回原输入和空 params", () => {
    const r = parseUrlToBaseAndParams("not-a-valid-url");
    expect(r.base).toBe("not-a-valid-url");
    expect(r.params).toEqual([]);
  });
});
