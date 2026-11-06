'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type InputHTMLAttributes } from 'react';

const KEYS = [...'абвгдежзийклмнопрстуфхцчшщъыьэюя', 'ё'];
const KB_KEY = 'russo.kb';

/** Escreve no <input> controlado do React: usa o setter nativo e dispara 'input' para o onChange do pai. */
function put(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Campo de digitação: sem autocorreção/autocapitalização/sugestões; com teclado russo opcional na tela. */
export const TypeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { cyrillic?: boolean }>(
  function TypeInput({ cyrillic = true, className = '', disabled, ...p }, ref) {
    const inner = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inner.current as HTMLInputElement, []);
    const [kb, setKb] = useState(false);
    useEffect(() => {
      try {
        setKb(cyrillic && localStorage.getItem(KB_KEY) === '1');
      } catch {
        /* sem armazenamento */
      }
    }, [cyrillic]);
    const toggle = () => {
      const next = !kb;
      setKb(next);
      try {
        localStorage.setItem(KB_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      inner.current?.focus();
    };
    const type = (ch: string) => {
      const el = inner.current;
      if (el && !disabled) put(el, el.value + ch);
    };
    const back = () => {
      const el = inner.current;
      if (el && !disabled) put(el, [...el.value].slice(0, -1).join(''));
    };
    return (
      <div>
        <input
          ref={inner}
          type="text"
          lang={cyrillic ? 'ru' : 'pt'}
          inputMode={kb ? 'none' : 'text'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          {...p}
          className={`min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-xl outline-none focus:border-brand ${className}`}
        />
        {cyrillic && !disabled && (
          <>
            <button type="button" onClick={toggle} data-testid="kb-toggle" aria-pressed={kb} className="mt-1 flex min-h-11 items-center text-sm font-medium text-brand">
              ⌨️ {kb ? 'Esconder teclado russo' : 'Teclado russo'}
            </button>
            {kb && (
              <div data-testid="kb" className="mb-1 grid grid-cols-7 gap-1">
                {KEYS.map((k) => (
                  <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => type(k)} className="min-h-11 rounded-lg bg-surface text-lg font-semibold shadow-sm active:bg-brand/20" lang="ru">
                    {k}
                  </button>
                ))}
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={back} aria-label="Apagar" className="col-span-2 min-h-11 rounded-lg bg-line text-lg font-semibold active:bg-brand/20">
                  ⌫
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  },
);
