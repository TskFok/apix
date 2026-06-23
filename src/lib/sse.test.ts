import { describe, it, expect } from "vitest";
import { SSEParser } from "./sse";

describe("SSEParser", () => {
  it("解析单个完整事件", () => {
    const parser = new SSEParser();
    const events: Array<{ event?: string; data?: string; id?: string }> = [];
    parser.parse("event: message\ndata: hello\n\n", (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ event: "message", data: "hello" });
  });

  it("解析多个事件", () => {
    const parser = new SSEParser();
    const events: Array<{ event?: string; data?: string; id?: string }> = [];
    parser.parse(
      "data: first\n\ndata: second\n\n",
      (e) => events.push(e)
    );
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe("first");
    expect(events[1].data).toBe("second");
  });

  it("跨 chunk 缓冲", () => {
    const parser = new SSEParser();
    const events: Array<{ event?: string; data?: string; id?: string }> = [];
    parser.parse("data: hel", (e) => events.push(e));
    expect(events).toHaveLength(0);
    parser.parse("lo\n\n", (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("hello");
  });

  it("flush 剩余 buffer", () => {
    const parser = new SSEParser();
    const events: Array<{ event?: string; data?: string; id?: string }> = [];
    parser.parse("data: pending", (e) => events.push(e));
    expect(events).toHaveLength(0);
    parser.flush((e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("pending");
  });
});
