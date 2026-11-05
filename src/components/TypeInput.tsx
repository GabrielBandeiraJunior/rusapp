'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';

/** Campo de digitação: sem autocorreção/autocapitalização/sugestões (teclado cirílico do iOS). */
export const TypeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { cyrillic?: boolean }>(
  function TypeInput({ cyrillic = true, className = '', ...p }, ref) {
    return (
      <input
        ref={ref}
        type="text"
        lang={cyrillic ? 'ru' : 'pt'}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        {...p}
        className={`min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-xl outline-none focus:border-brand ${className}`}
      />
    );
  },
);
