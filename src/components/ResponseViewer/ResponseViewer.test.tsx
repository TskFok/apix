import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ResponseViewer,
  getContentTypeFromHeaders,
  isHtmlResponse,
  getTextToCopyFromResponseBody,
} from './ResponseViewer';
import { useResponseStore } from '../../stores/responseStore';
import { useErrorLogStore } from '../../stores/errorLogStore';
import { useSettingsStore } from '../../stores/settingsStore';

describe('getContentTypeFromHeaders', () => {
  it('返回 content-type 的值，不区分头名大小写', () => {
    expect(getContentTypeFromHeaders({ 'content-type': 'text/html' })).toBe('text/html');
    expect(getContentTypeFromHeaders({ 'Content-Type': 'application/json' })).toBe(
      'application/json'
    );
    expect(getContentTypeFromHeaders({ 'CONTENT-TYPE': 'text/plain' })).toBe('text/plain');
  });

  it('支持带参数的 content-type', () => {
    expect(
      getContentTypeFromHeaders({ 'content-type': 'text/html; charset=utf-8' })
    ).toBe('text/html; charset=utf-8');
  });

  it('无 content-type 时返回 undefined', () => {
    expect(getContentTypeFromHeaders({})).toBeUndefined();
    expect(getContentTypeFromHeaders({ 'X-Custom': 'foo' })).toBeUndefined();
  });
});

describe('getTextToCopyFromResponseBody', () => {
  it('空字符串返回空', () => {
    expect(getTextToCopyFromResponseBody('')).toBe('');
  });

  it('合法 JSON 返回格式化文本', () => {
    expect(getTextToCopyFromResponseBody('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('非 JSON 返回原文', () => {
    expect(getTextToCopyFromResponseBody('plain text')).toBe('plain text');
  });
});

describe('isHtmlResponse', () => {
  it('content-type 为 text/html 时返回 true', () => {
    expect(isHtmlResponse({ 'content-type': 'text/html' })).toBe(true);
    expect(isHtmlResponse({ 'Content-Type': 'text/html; charset=utf-8' })).toBe(true);
  });

  it('content-type 非 text/html 时返回 false', () => {
    expect(isHtmlResponse({ 'content-type': 'application/json' })).toBe(false);
    expect(isHtmlResponse({ 'content-type': 'text/plain' })).toBe(false);
    expect(isHtmlResponse({})).toBe(false);
  });
});

describe('ResponseViewer text/html 美化显示', () => {
  beforeEach(() => {
    useResponseStore.getState().setHttpResponse({
      loading: false,
      error: undefined,
      headers: {},
      body: '',
    });
    useErrorLogStore.setState({ entries: [] });
    useSettingsStore.setState({ collectErrorLogs: false });
  });

  it('当 content-type 为 text/html 且有 body 时显示预览与源代码切换', () => {
    useResponseStore.getState().setHttpResponse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><body><h1>Hello</h1></body></html>',
      loading: false,
    });

    render(<ResponseViewer />);

    expect(screen.getByRole('button', { name: '预览' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '源代码' })).toBeInTheDocument();
  });

  it('当 content-type 为 text/html 时默认显示 iframe 预览', () => {
    const htmlBody = '<html><body><p>Preview content</p></body></html>';
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'Content-Type': 'text/html' },
      body: htmlBody,
      loading: false,
    });

    render(<ResponseViewer />);

    const iframe = screen.getByTitle('HTML 预览');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('srcDoc', htmlBody);
    expect(iframe).toHaveAttribute('sandbox');
  });

  it('非 text/html 响应不显示 HTML 预览选项卡', () => {
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
      loading: false,
    });

    render(<ResponseViewer />);

    expect(screen.queryByRole('button', { name: '预览' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '源代码' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('HTML 预览')).not.toBeInTheDocument();
  });

  it('当 JSON 含 code/message/data/title 且 data 为空字符串时仍显示内容', () => {
    const body =
      '{"code":"-50","message":"\\u65e0\\u6cd5\\u83b7\\u53d6\\u4f1a\\u5458\\u767b\\u5f55\\u4fe1\\u606f","data":"","title":"\\u83b7\\u53d6\\u4f1a\\u5458\\u8be6\\u7ec6\\u4fe1\\u606f"}';
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body,
      loading: false,
    });

    render(<ResponseViewer />);

    // 应显示 JSON 内容，而非空响应体
    expect(screen.queryByText('空响应体')).not.toBeInTheDocument();
    expect(screen.getByText(/无法获取会员登录信息/)).toBeInTheDocument();
  });

  it('当 Content-Type 为 text/html 但 body 为 JSON 时按 JSON 显示', () => {
    const body =
      '{"code":"-50","message":"\\u65e0\\u6cd5\\u83b7\\u53d6\\u4f1a\\u5458\\u767b\\u5f55\\u4fe1\\u606f","data":"","title":"\\u83b7\\u53d6\\u4f1a\\u5458\\u8be6\\u7ec6\\u4fe1\\u606f"}';
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body,
      loading: false,
    });

    render(<ResponseViewer />);

    // 应显示 JSON 树视图，而非 HTML 预览（避免 iframe 中 JSON 显示异常）
    expect(screen.queryByTitle('HTML 预览')).not.toBeInTheDocument();
    expect(screen.getByText(/无法获取会员登录信息/)).toBeInTheDocument();
  });

  it('错误日志标签可展示收集到的详细错误', () => {
    useSettingsStore.getState().setCollectErrorLogs(true);
    useErrorLogStore.getState().addEntry({
      source: 'http',
      message: 'request failed',
      detail: 'timeout',
      context: { method: 'GET', url: 'https://example.com' },
    });
    useResponseStore.getState().setHttpResponse({
      status: 500,
      headers: {},
      body: '',
      loading: false,
    });

    render(<ResponseViewer />);

    fireEvent.click(screen.getByRole('button', { name: /错误日志/ }));
    expect(screen.getByText('request failed')).toBeInTheDocument();
    expect(screen.getByText(/timeout/)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/example.com/)).toBeInTheDocument();
  });
});

describe('ResponseViewer 复制响应体', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Body 标签下无 body 时复制按钮禁用', () => {
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: {},
      body: '',
      loading: false,
    });
    render(<ResponseViewer />);
    expect(screen.getByRole('button', { name: '复制响应体' })).toBeDisabled();
  });

  it('Headers 标签下无响应头时复制按钮禁用且文案为复制全部响应头', () => {
    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: {},
      body: '{"x":1}',
      loading: false,
    });
    render(<ResponseViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(screen.getByRole('button', { name: '复制全部响应头' })).toBeDisabled();
  });

  it('点击复制将格式化后的 JSON 写入剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"x":1}',
      loading: false,
    });
    render(<ResponseViewer />);
    fireEvent.click(screen.getByRole('button', { name: '复制响应体' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{\n  "x": 1\n}');
    });
  });

  it('Headers 标签下点击复制写入全部响应头', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    useResponseStore.getState().setHttpResponse({
      status: 200,
      headers: { 'X-Test': 'a', 'Content-Type': 'application/json' },
      body: '{}',
      loading: false,
    });
    render(<ResponseViewer />);
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    fireEvent.click(screen.getByRole('button', { name: '复制全部响应头' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('X-Test: a\nContent-Type: application/json');
    });
  });
});
