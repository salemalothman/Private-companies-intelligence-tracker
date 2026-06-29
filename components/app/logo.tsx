/**
 * Automation Investment Intelligence Platform brand mark — a network graph of
 * connected nodes rising inside a broken circle (recreated as SVG from the
 * brand logo). Swap in /logo.png if you prefer the exact raster asset.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Automation Investment Intelligence Platform"
    >
      {/* broken outer circle */}
      <path
        d="M15 9.5 A 17 17 0 0 0 9 31"
        stroke="#5C9EAD"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M33 38.5 A 17 17 0 0 0 39 17"
        stroke="#5C9EAD"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* connecting graph lines */}
      <path
        d="M12 33 L20 24 L16 15 L31 11 M20 24 L34 20"
        stroke="#5C9EAD"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* nodes */}
      <circle cx="12" cy="33" r="2.8" fill="#5C9EAD" />
      <circle cx="20" cy="24" r="2.8" fill="#5C9EAD" />
      <circle cx="16" cy="15" r="2.8" fill="#5C9EAD" />
      <circle cx="31" cy="11" r="3.2" fill="#5C9EAD" />
      <circle cx="34" cy="20" r="2.8" fill="#5C9EAD" />
    </svg>
  );
}
