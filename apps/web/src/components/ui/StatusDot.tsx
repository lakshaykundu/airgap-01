import { cn } from '../../utils/cn';

const TONES = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
  accent: 'bg-accent',
  muted: 'bg-fg-3',
} as const;

export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: keyof typeof TONES;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden>
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping',
            TONES[tone],
          )}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONES[tone])} />
    </span>
  );
}
