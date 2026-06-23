/** 响应区展开：双 chevron 向下（占满下方区域） */
export function IconResponseAreaExpand() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m7 13 5 5 5-5" />
      <path d="m7 8 5 5 5-5" />
    </svg>
  );
}

/** 响应区收起：双 chevron 向上 */
export function IconResponseAreaCollapse() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m7 14 5-5 5 5" />
      <path d="m7 19 5-5 5 5" />
    </svg>
  );
}
