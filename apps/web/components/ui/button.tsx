import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonTone = 'cta' | 'green' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonAsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  asChild?: false;
  children: ReactNode;
}

interface ButtonAsChildProps {
  tone?: ButtonTone;
  size?: ButtonSize;
  asChild: true;
  children: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  className?: string;
}

type ButtonProps = ButtonAsButtonProps | ButtonAsChildProps;

const toneClasses: Record<ButtonTone, string> = {
  cta: [
    'bg-gradient-to-br from-accent to-secondary text-white border-transparent',
    'shadow-[0_4px_14px_rgba(232,148,111,0.35),0_1px_2px_rgba(39,30,51,0.08)]',
    'hover:brightness-105',
    'disabled:opacity-55 disabled:cursor-not-allowed',
  ].join(' '),
  green: [
    'bg-gradient-to-br from-primary to-primary-deep text-white border-transparent',
    'shadow-[0_4px_14px_rgba(111,134,201,0.35),0_1px_2px_rgba(39,30,51,0.08)]',
    'hover:brightness-105',
    'disabled:opacity-55 disabled:cursor-not-allowed',
  ].join(' '),
  ghost: [
    'bg-transparent border-line text-ink-soft shadow-none',
    'hover:bg-paper-soft',
    'disabled:opacity-55 disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-[9px]',
  md: 'text-sm px-4 py-2.5 rounded-[12px]',
  lg: 'text-base px-5 py-3.5 rounded-[14px]',
};

function buildClasses(tone: ButtonTone, size: ButtonSize, extra?: string): string {
  return [
    'inline-flex items-center justify-center gap-2 font-bold',
    'border transition-all active:translate-y-px',
    toneClasses[tone],
    sizeClasses[size],
    extra ?? '',
  ]
    .join(' ')
    .trim();
}

export function Button(props: ButtonProps) {
  const { tone = 'cta', size = 'md', children } = props;

  if (props.asChild === true) {
    const { href, target, rel, className } = props;
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={buildClasses(tone, size, className)}
      >
        {children}
      </a>
    );
  }

  const { asChild: _asChild, tone: _tone, size: _size, children: _children, className: _className, ...rest } = props as ButtonAsButtonProps;
  return (
    <button
      type={rest.type ?? 'button'}
      className={buildClasses(tone, size, _className)}
      {...rest}
    >
      {children}
    </button>
  );
}
