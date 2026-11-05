import type { HTMLAttributes } from 'react';

/** Texto russo (sempre já acentuado pelos dados). */
export function Ru({ children, className = '', ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span lang="ru" {...rest} className={`ru ${className}`}>
      {children}
    </span>
  );
}
