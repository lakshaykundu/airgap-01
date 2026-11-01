import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-elevated text-fg-3">
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_0%,rgba(36,229,192,0.15),transparent_70%)]" />
        {icon}
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 px-5 py-4">
      <p className="text-sm font-semibold text-danger">{title}</p>
      {description && <div className="mt-1 text-sm text-fg-2">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-elevated/80', className)} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-bg px-1 font-mono text-[10px] text-fg-3">
      {children}
    </kbd>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-lg border border-line bg-bg/60 p-0.5', className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors',
            value === option.value
              ? 'bg-elevated text-fg shadow-[inset_0_0_0_1px_var(--border)]'
              : 'text-fg-3 hover:text-fg-2',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
