import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  side?: 'right' | 'left';
  className?: string;
  footer?: ReactNode;
}

/** Slide-over drawer built on Radix Dialog (focus trap + Escape). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  children,
  side = 'right',
  className,
  footer,
}: SheetProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#02040a]/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            'fixed top-0 bottom-0 z-50 flex w-full flex-col border-line bg-surface/95 shadow-2xl backdrop-blur-xl sm:w-[min(560px,92vw)]',
            side === 'right'
              ? 'right-0 border-l data-[state=open]:animate-slide-in-right'
              : 'left-0 border-r data-[state=open]:animate-fade-in',
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
            <div className="min-w-0">
              {eyebrow && <p className="label-xs mb-1">{eyebrow}</p>}
              <D.Title className="text-base font-semibold tracking-tight">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-fg-2">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">Panel</D.Description>
              )}
            </div>
            <D.Close
              className="-mr-1 rounded-lg p-1.5 text-fg-3 hover:bg-hover hover:text-fg"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </D.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <footer className="border-t border-line/70 px-5 py-3">{footer}</footer>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
