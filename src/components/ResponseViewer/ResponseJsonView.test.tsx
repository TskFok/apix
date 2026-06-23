import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResponseJsonView } from './ResponseJsonView';
import { defaultStyles } from 'react-json-view-lite';

const testStyle = {
  ...defaultStyles,
  container: 'apix-json-container',
  label: 'apix-json-label',
  basicChildStyle: defaultStyles.basicChildStyle,
  childFieldsContainer: defaultStyles.childFieldsContainer,
  punctuation: defaultStyles.punctuation,
  collapseIcon: defaultStyles.collapseIcon,
  expandIcon: defaultStyles.expandIcon,
  collapsedContent: defaultStyles.collapsedContent,
};

describe('ResponseJsonView', () => {
  it('对象中的数组字段后显示元素个数', () => {
    render(<ResponseJsonView data={{ items: [1, 2, 3] }} style={testStyle} />);
    expect(screen.getByText('3 项')).toBeInTheDocument();
  });

  it('空数组显示 0 项', () => {
    render(<ResponseJsonView data={{ items: [] }} style={testStyle} />);
    expect(screen.getByText('0 项')).toBeInTheDocument();
  });

  it('顶层为数组时显示元素个数', () => {
    render(<ResponseJsonView data={[10, 20]} style={testStyle} />);
    expect(screen.getByText('2 项')).toBeInTheDocument();
  });

  it('纯对象不显示「项」计数', () => {
    render(<ResponseJsonView data={{ a: 1, b: 2 }} style={testStyle} />);
    expect(screen.queryByText(/项/)).not.toBeInTheDocument();
  });
});
