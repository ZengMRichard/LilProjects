import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);
export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);
export const IconDot = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
  </Base>
);
export const IconArrow = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);
export const IconLock = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </Base>
);
export const IconCamera = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Base>
);
export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6z" />
    <path d="M9 12l2.2 2.2L15 10.4" />
  </Base>
);
export const IconRuler = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="8" width="18" height="8" rx="1.5" />
    <path d="M7 8v3M11 8v4M15 8v3M19 8v0" />
  </Base>
);
export const IconWave = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0" />
  </Base>
);
export const IconHeart = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 20s-7-4.4-7-9.6A4 4 0 0112 8a4 4 0 017 2.4C19 15.6 12 20 12 20z" />
  </Base>
);
export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" />
  </Base>
);
export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Base>
);
export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8v.01" />
  </Base>
);
export const IconFlask = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 3h4M10.5 3v6L5 18.5A1.5 1.5 0 006.3 21h11.4a1.5 1.5 0 001.3-2.5L13.5 9V3" />
    <path d="M8 15h8" />
  </Base>
);
export const IconSpark = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
  </Base>
);

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" stroke="#a8d3f2" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M12 2v20M3.5 7L12 12l8.5-5M3.5 17L12 12l8.5 5"
        stroke="#a8d3f2"
        strokeOpacity=".45"
        strokeWidth="1"
      />
      <circle cx="12" cy="12" r="1.7" fill="#a8d3f2" />
    </svg>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: "spin 0.9s linear infinite" }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
