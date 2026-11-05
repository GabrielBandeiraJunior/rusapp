'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Hoje', icon: '🏠' },
  { href: '/alfabeto/', label: 'Alfabeto', icon: 'Аб' },
  { href: '/vocabulario/', label: 'Vocab.', icon: '📚' },
  { href: '/gramatica/', label: 'Casos', icon: '✏️' },
  { href: '/leitura/', label: 'Leitura', icon: '📖' },
];

export function TabBar() {
  const path = usePathname() || '/';
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur safe-bottom"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href.replace(/\/$/, ''));
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? 'text-brand' : 'text-muted'}`}
              >
                <span aria-hidden className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
