import { useId } from 'react';
import { cn } from '../../utils/cn';

export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a gradient defined inside a display:none SVG cannot be
  // referenced by another, visible copy of the logo.
  const gradientId = `logo-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#24e5c0" />
          <stop offset="1" stopColor="#9275ff" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="#0b1020"
        stroke={`url(#${gradientId})`}
        strokeOpacity="0.7"
      />
      <path
        d="M8 22 L16 8 L24 22"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 17h3.2M17.3 17h3.2" stroke="#24e5c0" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="font-mono text-[13px] font-semibold tracking-[0.16em] text-fg">
          AIRGAP<span className="text-primary">/</span>01
        </span>
      )}
    </span>
  );
}
