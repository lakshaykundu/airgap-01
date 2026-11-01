import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Full-screen on phones; centered card from `sm` up. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  eyebrow?: ReactNode;
}

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

/** Radix Dialog: focus trap, Escape-to-close, focus return, aria wiring. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  size = 'md',
  eyebrow,
}: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#02040a]/75 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            'panel panel-lit fixed inset-0 z-50 flex flex-col overflow-hidden rounded-none border-0 bg-surface sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88dvh] sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border data-[state=open]:animate-scale-in',
            SIZES[size],
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
            <div className="min-w-0">
              {eyebrow && <p className="label-xs mb-1">{eyebrow}</p>}
              <D.Title className="text-base font-semibold tracking-tight text-fg">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-sm text-fg-2">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">Dialog</D.Description>
              )}
            </div>
            <D.Close
              className="-mr-1 rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-hover hover:text-fg"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </D.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
