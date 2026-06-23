/**
 * 基于 react-json-view-lite 的渲染逻辑，为数组节点增加「n 项」展示（仅 UI，不参与 JSON.stringify / 复制）。
 */
import * as React from 'react';
import {
  defaultStyles as rjvDefaultStyles,
  type NodeExpandingEvent,
  type Props as JsonViewProps,
} from 'react-json-view-lite';
import type { StyleProps } from 'react-json-view-lite/dist/DataRenderer';

const isBoolean = (data: unknown): data is boolean =>
  typeof data === 'boolean' || data instanceof Boolean;
const isNumber = (data: unknown): data is number =>
  typeof data === 'number' || data instanceof Number;
const isBigInt = (data: unknown): data is bigint =>
  typeof data === 'bigint' || data instanceof BigInt;
const isDate = (data: unknown): data is Date => !!data && data instanceof Date;
const isString = (data: unknown): data is string =>
  typeof data === 'string' || data instanceof String;
const isArray = (data: unknown): data is unknown[] => Array.isArray(data);
const isObject = (data: unknown): data is object =>
  typeof data === 'object' && data !== null;
const isFunction = (data: unknown): data is (...args: unknown[]) => unknown =>
  !!data && typeof (data as object) === 'object' && typeof data === 'function';

function quoteString(value: string | undefined, quoted?: boolean): string {
  if (quoted === undefined) quoted = false;
  return !value || quoted ? `"${value}"` : value;
}

function quoteStringValue(value: string, quoted: boolean, stringify: boolean): string {
  if (stringify) return JSON.stringify(value);
  return quoted ? `"${value}"` : value;
}

function ArrayItemCount({ count }: { count: number }) {
  return (
    <span className="response-json-array-count" aria-hidden>
      {count} 项
    </span>
  );
}

interface CommonRenderProps {
  lastElement: boolean;
  level: number;
  style: StyleProps;
  shouldExpandNode: (level: number, value: unknown, field?: string) => boolean;
  clickToExpandNode: boolean;
  outerRef: React.RefObject<HTMLDivElement | null>;
  beforeExpandChange?: (event: NodeExpandingEvent) => boolean;
}

interface JsonRenderProps<T = unknown> extends CommonRenderProps {
  field?: string;
  value: T;
}

interface ExpandableRenderProps extends CommonRenderProps {
  field: string | undefined;
  value: Array<unknown> | object;
  data: Array<[string | undefined, unknown]>;
  openBracket: string;
  closeBracket: string;
}

interface EmptyRenderProps {
  field: string | undefined;
  openBracket: string;
  closeBracket: string;
  lastElement: boolean;
  style: StyleProps;
}

function ExpandableObject({
  field,
  value,
  data,
  lastElement,
  openBracket,
  closeBracket,
  level,
  style,
  shouldExpandNode,
  clickToExpandNode,
  outerRef,
  beforeExpandChange,
}: ExpandableRenderProps) {
  const shouldExpandNodeCalledRef = React.useRef(false);
  const [expanded, setExpanded] = React.useState(() =>
    shouldExpandNode(level, value, field)
  );
  const expanderButtonRef = React.useRef<HTMLSpanElement | null>(null);
  const isArrayBracket = openBracket === '[';

  React.useEffect(() => {
    if (!shouldExpandNodeCalledRef.current) {
      shouldExpandNodeCalledRef.current = true;
    } else {
      setExpanded(shouldExpandNode(level, value, field));
    }
  }, [shouldExpandNode]);

  const contentsId = React.useId();
  if (data.length === 0) {
    return EmptyObject({
      field,
      openBracket,
      closeBracket,
      lastElement,
      style,
    });
  }

  const expanderIconStyle = expanded ? style.collapseIcon : style.expandIcon;
  const ariaLabel = expanded ? style.ariaLables.collapseJson : style.ariaLables.expandJson;
  const childLevel = level + 1;
  const lastIndex = data.length - 1;

  const setExpandWithCallback = (newExpandValue: boolean) => {
    if (
      expanded !== newExpandValue &&
      (!beforeExpandChange ||
        beforeExpandChange({ level, value, field, newExpandValue }))
    ) {
      setExpanded(newExpandValue);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setExpandWithCallback(e.key === 'ArrowRight');
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const direction = e.key === 'ArrowUp' ? -1 : 1;
      if (!outerRef.current) return;
      const buttonElements = outerRef.current.querySelectorAll('[role=button]');
      let currentIndex = -1;
      for (let i = 0; i < buttonElements.length; i++) {
        if ((buttonElements[i] as HTMLElement).tabIndex === 0) {
          currentIndex = i;
          break;
        }
      }
      if (currentIndex < 0) return;
      const nextIndex = (currentIndex + direction + buttonElements.length) % buttonElements.length;
      (buttonElements[currentIndex] as HTMLElement).tabIndex = -1;
      (buttonElements[nextIndex] as HTMLElement).tabIndex = 0;
      (buttonElements[nextIndex] as HTMLElement).focus();
    }
  };

  const onClick = () => {
    setExpandWithCallback(!expanded);
    const buttonElement = expanderButtonRef.current;
    if (!buttonElement) return;
    const prevButtonElement = outerRef.current?.querySelector(
      '[role=button][tabindex="0"]'
    ) as HTMLElement | null;
    if (prevButtonElement) prevButtonElement.tabIndex = -1;
    buttonElement.tabIndex = 0;
    buttonElement.focus();
  };

  return (
    <div className={style.basicChildStyle} role="treeitem" aria-expanded={expanded}>
      <span
        className={expanderIconStyle}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role="button"
        aria-label={ariaLabel}
        aria-expanded={expanded}
        aria-controls={expanded ? contentsId : undefined}
        ref={expanderButtonRef}
        tabIndex={level === 0 ? 0 : -1}
      />
      {(field || field === '') &&
        (clickToExpandNode ? (
          <span className={style.clickableLabel} onClick={onClick} onKeyDown={onKeyDown}>
            {quoteString(field, style.quotesForFieldNames)}:
          </span>
        ) : (
          <span className={style.label}>
            {quoteString(field, style.quotesForFieldNames)}:
          </span>
        ))}
      <span className={style.punctuation}>{openBracket}</span>
      {isArrayBracket ? <ArrayItemCount count={data.length} /> : null}
      {expanded ? (
        <ul id={contentsId} role="group" className={style.childFieldsContainer}>
          {data.map((dataElement, index) => (
            <DataRender
              key={dataElement[0] ?? index}
              field={dataElement[0]}
              value={dataElement[1]}
              style={style}
              lastElement={index === lastIndex}
              level={childLevel}
              shouldExpandNode={shouldExpandNode}
              clickToExpandNode={clickToExpandNode}
              beforeExpandChange={beforeExpandChange}
              outerRef={outerRef}
            />
          ))}
        </ul>
      ) : (
        <span className={style.collapsedContent} onClick={onClick} onKeyDown={onKeyDown} />
      )}
      <span className={style.punctuation}>{closeBracket}</span>
      {!lastElement && <span className={style.punctuation}>,</span>}
    </div>
  );
}

function EmptyObject({
  field,
  openBracket,
  closeBracket,
  lastElement,
  style,
}: EmptyRenderProps) {
  const isArrayBracket = openBracket === '[';
  return (
    <div className={style.basicChildStyle} role="treeitem">
      {(field || field === '') && (
        <span className={style.label}>
          {quoteString(field, style.quotesForFieldNames)}:
        </span>
      )}
      <span className={style.punctuation}>{openBracket}</span>
      {isArrayBracket ? <ArrayItemCount count={0} /> : null}
      <span className={style.punctuation}>{closeBracket}</span>
      {!lastElement && <span className={style.punctuation}>,</span>}
    </div>
  );
}

function JsonObject(props: JsonRenderProps<object>) {
  const { field, value, ...rest } = props;
  return ExpandableObject({
    field,
    value,
    lastElement: rest.lastElement || false,
    level: rest.level,
    openBracket: '{',
    closeBracket: '}',
    style: rest.style,
    shouldExpandNode: rest.shouldExpandNode,
    clickToExpandNode: rest.clickToExpandNode,
    data: Object.keys(value).map((key) => [key, (value as Record<string, unknown>)[key]]),
    outerRef: rest.outerRef,
    beforeExpandChange: rest.beforeExpandChange,
  });
}

function JsonArray(props: JsonRenderProps<unknown[]>) {
  const { field, value, ...rest } = props;
  return ExpandableObject({
    field,
    value,
    lastElement: rest.lastElement || false,
    level: rest.level,
    openBracket: '[',
    closeBracket: ']',
    style: rest.style,
    shouldExpandNode: rest.shouldExpandNode,
    clickToExpandNode: rest.clickToExpandNode,
    data: value.map((element) => [undefined, element] as [undefined, unknown]),
    outerRef: rest.outerRef,
    beforeExpandChange: rest.beforeExpandChange,
  });
}

function JsonPrimitiveValue({
  field,
  value,
  style,
  lastElement,
}: Pick<JsonRenderProps, 'field' | 'value' | 'style' | 'lastElement'>) {
  let stringValue: string;
  let valueStyle = style.otherValue;
  if (value === null) {
    stringValue = 'null';
    valueStyle = style.nullValue;
  } else if (value === undefined) {
    stringValue = 'undefined';
    valueStyle = style.undefinedValue;
  } else if (isString(value)) {
    stringValue = quoteStringValue(
      value,
      !style.noQuotesForStringValues,
      style.stringifyStringValues
    );
    valueStyle = style.stringValue;
  } else if (isBoolean(value)) {
    stringValue = value ? 'true' : 'false';
    valueStyle = style.booleanValue;
  } else if (isNumber(value)) {
    stringValue = value.toString();
    valueStyle = style.numberValue;
  } else if (isBigInt(value)) {
    stringValue = `${value.toString()}n`;
    valueStyle = style.numberValue;
  } else if (isDate(value)) {
    stringValue = value.toISOString();
  } else if (isFunction(value)) {
    stringValue = 'function() { }';
  } else {
    stringValue = String(value);
  }
  return (
    <div className={style.basicChildStyle} role="treeitem">
      {(field || field === '') && (
        <span className={style.label}>
          {quoteString(field, style.quotesForFieldNames)}:
        </span>
      )}
      <span className={valueStyle}>{stringValue}</span>
      {!lastElement && <span className={style.punctuation}>,</span>}
    </div>
  );
}

function DataRender(props: JsonRenderProps) {
  const value = props.value;
  if (isArray(value)) {
    return <JsonArray {...props} value={value} />;
  }
  if (isObject(value) && !isDate(value) && !isFunction(value)) {
    return <JsonObject {...props} value={value as object} />;
  }
  return <JsonPrimitiveValue {...props} />;
}

const allExpanded = () => true;

export function ResponseJsonView({
  data,
  style = rjvDefaultStyles,
  shouldExpandNode = allExpanded,
  clickToExpandNode = false,
  beforeExpandChange,
  compactTopLevel,
  ...ariaAttrs
}: JsonViewProps) {
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const mergedStyle: StyleProps = { ...rjvDefaultStyles, ...style };

  return (
    <div
      aria-label="JSON view"
      {...ariaAttrs}
      className={mergedStyle.container}
      ref={outerRef}
      role="tree"
    >
      {compactTopLevel && isObject(data) ? (
        Object.entries(data as Record<string, unknown>).map(([key, value]) => (
          <DataRender
            key={key}
            field={key}
            value={value}
            style={mergedStyle}
            lastElement
            level={1}
            shouldExpandNode={shouldExpandNode}
            clickToExpandNode={clickToExpandNode}
            beforeExpandChange={beforeExpandChange}
            outerRef={outerRef}
          />
        ))
      ) : (
        <DataRender
          value={data}
          style={mergedStyle}
          lastElement
          level={0}
          shouldExpandNode={shouldExpandNode}
          clickToExpandNode={clickToExpandNode}
          outerRef={outerRef}
          beforeExpandChange={beforeExpandChange}
        />
      )}
    </div>
  );
}
