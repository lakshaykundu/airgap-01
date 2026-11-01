import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Panel({
  className,
  lit = false,
  ...props
}: HTMLAttributes<HTMLElement> & { lit?: boolean }) {
  return <section className={cn('panel', lit && 'panel-lit', className)} {...props} />;
}

export function PanelHeader({
  title,
  eyebrow,
  actions,
  className,
  id,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-3 border-b border-line/70 px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="label-xs mb-0.5">{eyebrow}</p>}
        <h2 id={id} className="truncate text-sm font-semibold tracking-tight text-fg">
          {title}
        </h2>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
