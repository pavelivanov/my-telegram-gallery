import type {
  ButtonHTMLAttributes,
  FC,
  PropsWithChildren,
} from 'react';

export const Spinner: FC<{ className?: string }> = ({
  className = 'text-2xl text-brass',
}) => (
  <span
    className={`inline-block animate-spin font-display [animation-duration:2.5s] ${className}`}
    role="status"
    aria-label="Loading"
  >
    ✦
  </span>
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'plain';
}

export const Button: FC<ButtonProps> = ({
  loading = false,
  variant = 'primary',
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <button
    className={`flex items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-opacity active:opacity-70 disabled:opacity-50 ${
      variant === 'primary'
        ? 'w-full bg-brass px-4 py-3 text-night'
        : 'bg-transparent px-2 py-2 text-brass'
    } ${className}`}
    disabled={disabled || loading}
    {...rest}
  >
    {loading ? <Spinner className="text-[17px] text-current" /> : children}
  </button>
);

export const Placeholder: FC<
  PropsWithChildren<{ header: string; description?: string }>
> = ({ header, description, children }) => (
  <div className="animate-fade px-6 py-16 text-center">
    {children && <div className="mb-5 flex justify-center">{children}</div>}
    <h2 className="font-display text-xl text-ink">{header}</h2>
    {description && (
      <p className="mx-auto mt-2 max-w-xs text-[13px] text-ink-dim [overflow-wrap:anywhere]">
        {description}
      </p>
    )}
  </div>
);
