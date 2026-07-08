import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type Size = 'default' | 'sm' | 'lg' | 'icon';

const variantClasses: Record<Variant, string> = {
  default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
  secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80',
  outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--secondary)]',
  ghost: 'bg-transparent hover:bg-[var(--secondary)]',
  destructive: 'bg-[var(--destructive)] text-white hover:opacity-90',
};

const sizeClasses: Record<Size, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-sm',
  lg: 'h-10 px-6 text-base',
  icon: 'h-9 w-9',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
