export function Logomark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M16 4 5.5 9.2v6.6c0 6.2 4.3 11.5 10.5 13 6.2-1.5 10.5-6.8 10.5-13V9.2L16 4Z"
        stroke="var(--gold)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="rgba(212,168,71,0.07)"
      />
      <path
        d="M10.8 13.4h10.4M10.8 17.2h7.2M10.8 21h4.6"
        stroke="var(--gold-bright)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
