import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-[#03140f] font-semibold hover:bg-[#4ff0d0] shadow-[0_0_0_1px_rgba(36,229,192,0.4),0_8px_24px_-8px_rgba(36,229,192,0.55)]',
  accent:
    'bg-accent text-white font-semibold hover:bg-[#a48cff] shadow-[0_0_0_1px_rgba(146,117,255,0.4),0_8px_24px_-8px_rgba(146,117,255,0.55)]',
  secondary: 'bg-elevated text-fg border border-line hover:bg-hover hover:border-[#2f4260]',
  outline: 'border border-line text-fg-2 hover:text-fg hover:border-primary/60 hover:bg-primary/5',
  ghost: 'text-fg-2 hover:text-fg hover:bg-hover',
  danger: 'bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20',
};

const sizes: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-md',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-sm gap-2.5 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  mono?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', mono = false, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap transition-[background,color,border,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
        mono && 'font-mono uppercase tracking-[0.08em]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
