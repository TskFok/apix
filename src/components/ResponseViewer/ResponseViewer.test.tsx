import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ResponseViewer,
  getContentTypeFromHeaders,
  isHtmlResponse,
} from './ResponseViewer';
import { useResponseStore } from '../../stores/responseStore';

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
});
