import { AlertDialog as A } from 'radix-ui';
import type { ReactNode } from 'react';
import { Button } from './Button';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'primary';
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-[70] bg-[#02040a]/75 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <A.Content className="panel panel-lit fixed top-1/2 left-1/2 z-[70] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 bg-surface p-5 data-[state=open]:animate-scale-in">
          <A.Title className="text-base font-semibold">{title}</A.Title>
          <A.Description asChild>
            <div className="mt-2 text-sm text-fg-2">{description}</div>
          </A.Description>
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </A.Cancel>
            <A.Action asChild>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                size="sm"
                mono
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
