import { describe, it, expect } from "vitest";
import {
  buildUrl,
  buildDisplayUrl,
  buildDisplayUrlFromQueryFields,
  parseUrlToBaseAndParams,
} from "./http";

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

  it("base 以 ? 结尾时与 Params 表拼接不重复 &", () => {
    expect(
      buildDisplayUrl("https://api.example.com?", { foo: "bar" })
    ).toBe("https://api.example.com?foo=bar");
  });

  it("Record 无标志时空 value 不带 =", () => {
    expect(buildDisplayUrl("https://api.example.com", { foo: "" })).toBe(
      "https://api.example.com?foo"
    );
  });

  it("空 value 与有 value 的键并列时正确拼接", () => {
    expect(
      buildDisplayUrl("https://api.example.com", { a: "", b: "2" })
    ).toBe("https://api.example.com?a&b=2");
  });
});

describe("buildDisplayUrlFromQueryFields", () => {
  it("空 value 且无 queryEmptyShowsEquals 时不带 =", () => {
    expect(
      buildDisplayUrlFromQueryFields("https://api.example.com", [
        { key: "a", value: "", enabled: true },
      ])
    ).toBe("https://api.example.com?a");
  });

  it("空 value 且 queryEmptyShowsEquals 时保留 =", () => {
    expect(
      buildDisplayUrlFromQueryFields("https://api.example.com", [
        { key: "a", value: "", enabled: true, queryEmptyShowsEquals: true },
      ])
    ).toBe("https://api.example.com?a=");
  });

  it("trailingAmpersand 时在查询串末尾保留 &", () => {
    expect(
      buildDisplayUrlFromQueryFields(
        "https://api.example.com",
        [{ key: "a", value: "1", enabled: true }],
        { trailingAmpersand: true }
      )
    ).toBe("https://api.example.com?a=1&");
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

  it("保留仅根路径时的尾部斜杠（便于在地址栏输入路径）", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com/");
    expect(r.base).toBe("https://api.example.com/");
    expect(r.params).toEqual([]);
  });

  it("保留单独 ?（空查询）以便继续输入查询串", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com?");
    expect(r.base).toBe("https://api.example.com?");
    expect(r.params).toEqual([]);
  });

  it("path 后单独 ? 同样保留", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com/path?");
    expect(r.base).toBe("https://api.example.com/path?");
    expect(r.params).toEqual([]);
  });

  it("?key 无 = 与 ?key= 可区分", () => {
    const noEq = parseUrlToBaseAndParams("https://api.example.com?a");
    expect(noEq.params).toEqual([{ key: "a", value: "" }]);
    expect(noEq.params[0].emptyValueHasTrailingEquals).toBeUndefined();

    const withEq = parseUrlToBaseAndParams("https://api.example.com?a=");
    expect(withEq.params).toEqual([
      { key: "a", value: "", emptyValueHasTrailingEquals: true },
    ]);
  });

  it("search 以 & 结尾时标记 trailingAmpersand", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com?a=1&");
    expect(r.trailingAmpersand).toBe(true);
    expect(r.params).toEqual([{ key: "a", value: "1" }]);
  });

  it("?& 时仍标记尾随 & 且无参", () => {
    const r = parseUrlToBaseAndParams("https://api.example.com?&");
    expect(r.trailingAmpersand).toBe(true);
    expect(r.params).toEqual([]);
  });
});
