/**
 * CrowMark — the Dungeon Hub brand icon (obsidian aesthetic).
 * Dark obsidian gradient tile with copper border + copper glyph.
 * No props. Server component.
 */
export function CrowMark() {
  return (
    <span
      className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-md border border-accent text-accent flex-shrink-0"
      style={{
        background: 'linear-gradient(135deg, #221E30, #0B0A12)',
        boxShadow: '0 0 0 1px rgba(212, 162, 76, 0.10), 0 2px 6px rgba(0, 0, 0, 0.5)',
      }}
      aria-hidden="true"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 -64 640 640"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path d="M544 32h-16.36C513.04 12.68 490.09 0 464 0c-44.18 0-80 35.82-80 80v20.98L12.09 393.57A30.216 30.216 0 0 0 0 417.74c0 22.46 23.64 37.07 43.73 27.03L165.27 384h96.49l44.41 120.1c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38L312.94 384H352c1.91 0 3.76-.23 5.66-.29l44.51 120.38c2.27 6.23 9.15 9.44 15.38 7.17l22.55-8.21c6.23-2.27 9.44-9.15 7.17-15.38l-41.24-111.53C485.74 352.8 544 279.26 544 192v-80l96-16c0-35.35-42.98-64-96-64zm-80 72c-13.25 0-24-10.75-24-24 0-13.26 10.75-24 24-24s24 10.74 24 24c0 13.25-10.75 24-24 24z" />
      </svg>
    </span>
  );
}
