import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../utils/cn';

const control =
  'w-full rounded-lg border border-line bg-bg/60 px-3 text-sm text-fg placeholder:text-fg-3 transition-colors hover:border-[#2f4260] focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-danger/70';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="label-xs block text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(control, 'min-h-24 py-2 leading-relaxed', className)}
      {...props}
    />
  );
});

/** Native select: fully accessible and mobile-friendly, styled to match. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          control,
          'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%237b8aa3%27 stroke-width=%272%27%3E%3Cpath d=%27M3 4.5l3 3 3-3%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
