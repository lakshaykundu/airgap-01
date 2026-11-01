import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { uiActions, type Toast } from '../../store/uiSlice';
import { cn } from '../../utils/cn';

const ICON = {
  info: <Info className="h-4 w-4 text-primary" />,
  success: <CircleCheck className="h-4 w-4 text-success" />,
  warning: <TriangleAlert className="h-4 w-4 text-warning" />,
  error: <OctagonAlert className="h-4 w-4 text-danger" />,
};

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const id = setTimeout(
      () => dispatch(uiActions.dismissToast(toast.id)),
      toast.tone === 'error' ? 8000 : 4500,
    );
    return () => clearTimeout(id);
  }, [dispatch, toast.id, toast.tone]);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
      className={cn(
        'panel flex w-[min(360px,calc(100vw-2rem))] items-start gap-3 bg-elevated/95 p-3.5',
      )}
    >
      <span className="mt-0.5">{ICON[toast.tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-xs text-fg-2">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dispatch(uiActions.dismissToast(toast.id))}
        className="rounded p-0.5 text-fg-3 hover:text-fg"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.li>
  );
}

export function Toaster() {
  const toasts = useAppSelector((state) => state.ui.toasts);
  return (
    <ol
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-[80] flex flex-col items-end gap-2 [&>li]:pointer-events-auto"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </ol>
  );
}
