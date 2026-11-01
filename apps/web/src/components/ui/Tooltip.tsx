import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export const TooltipProvider = T.Provider;

/** Accessible tooltip: shown on hover AND keyboard focus; content is announced via aria-describedby. */
export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg-2 shadow-xl data-[state=delayed-open]:animate-fade-in"
        >
          {content}
          <T.Arrow className="fill-elevated" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
