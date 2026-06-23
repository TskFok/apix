import type { SSERawEvent } from '../types';

/**
 * 解析 SSE 格式的 chunk，可能包含多个事件（以 \n\n 分隔）
 * 支持跨 chunk 的缓冲（一个 event 可能被拆分到多个 chunk）
 */
export class SSEParser {
  private buffer = '';

  /**
   * 解析新的 chunk，返回解析出的事件列表
   */
  parse(chunk: string, onEvent: (event: SSERawEvent) => void): void {
    this.buffer += chunk;
    const events = this.buffer.split(/\n\n+/);
    this.buffer = events.pop() ?? '';

    for (const raw of events) {
      const event = this.parseEvent(raw);
      if (event && (event.data !== undefined || event.event !== undefined)) {
        onEvent(event);
      }
    }
  }

  /**
   * 处理剩余 buffer（连接关闭时调用）
   */
  flush(onEvent: (event: SSERawEvent) => void): void {
    if (this.buffer.trim()) {
      const event = this.parseEvent(this.buffer);
      if (event && (event.data !== undefined || event.event !== undefined)) {
        onEvent(event);
      }
    }
    this.buffer = '';
  }

  private parseEvent(raw: string): SSERawEvent | null {
    const lines = raw.split('\n');
    const event: SSERawEvent = {};
    let dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.event = line.slice(6).trim();
      } else if (line.startsWith('id:')) {
        event.id = line.slice(3).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length > 0) {
      event.data = dataLines.join('\n');
    }

    return Object.keys(event).length > 0 ? event : null;
  }
}
