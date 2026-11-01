import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="label-xs text-primary/80">{eyebrow}</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {children}
    </div>
  );
}
