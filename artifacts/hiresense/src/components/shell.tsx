import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Compass, SlidersHorizontal, Columns3, PackageOpen, ScrollText, Menu, X, MessageSquareText } from 'lucide-react';
import { useInputs, countProvided, TOTAL_FIELDS } from '@/lib/inputs-store';
import { DisclosuresDialog } from '@/components/disclosures';
import { useAskOptional } from '@/lib/ask-store';

const NAV = [
  { href: '/', label: 'Overview', icon: Compass },
  { href: '/inputs', label: 'Business inputs', icon: SlidersHorizontal },
  { href: '/scenarios', label: 'Scenarios', icon: Columns3 },
  { href: '/ask', label: 'Ask HireSense', icon: MessageSquareText },
  { href: '/setup', label: 'Setup & handoff', icon: PackageOpen },
];

export function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="hsl(174 62% 42%)" />
      <path d="M9 22V10M9 16h8M17 10v12" stroke="hsl(216 55% 13%)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="23" cy="20" r="2.4" fill="hsl(216 55% 13%)" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const previousLocation = useRef(location);
  const { inputs } = useInputs();
  const n = countProvided(inputs);
  const ask = useAskOptional();

  function showPageStart() {
    // Focusing the entire tall main region can scroll its bottom into view.
    // Keep focus accessible, then explicitly position the document at its start.
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  useLayoutEffect(() => {
    if (previousLocation.current !== location) {
      previousLocation.current = location;
      setOpen(false);
      showPageStart();
    }
  }, [location]);

  useEffect(() => {
    // A direct/deep-link load can inherit the browser's previous scroll position
    // even though no route change occurred after this shell mounted.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function closeMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }

  const nav = (
    <nav aria-label="Primary" className="flex min-w-0 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = location === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={(event) => {
              // Preserve normal modified-click/new-tab behavior.
              if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              setOpen(false);
              // A current-page tap does not cause a route change.
              if (href === location) showPageStart();
            }}
            aria-current={active ? 'page' : undefined}
            data-testid={`link-nav-${label.split(' ')[0].toLowerCase()}`}
            className={`group flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              active ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/60'
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-sidebar-primary' : ''}`} />
            <span className="min-w-0 flex-1 break-words">{label}</span>
            {href === '/inputs' && (
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-sidebar-foreground/50">{n}/{TOTAL_FIELDS}</span>
            )}
          </Link>
        );
      })}
      <DisclosuresDialog
        trigger={
          <button
            data-testid="button-nav-disclosures"
            className="flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/60 text-left"
          >
            <ScrollText className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">Disclosures</span>
          </button>
        }
      />
    </nav>
  );

  const status = (
    <div className="min-w-0 rounded-xl border border-sidebar-border p-4 text-xs space-y-2.5">
      <p className="uppercase tracking-[0.14em] text-[10px] text-sidebar-foreground/50">Session status</p>
      <StatusRow ok label="Calculations run in this browser" />
      <StatusRow ok={!!ask?.accessApproved} label={ask?.accessApproved ? 'Q&A availability checked' : 'Q&A availability not checked'} />
      <StatusRow ok={!!ask?.lastValidated} label={ask?.lastValidated ? 'Last Q&A answer validated' : 'No Q&A answer this session'} />
      <StatusRow label={!ask?.budget ? 'App usage: unknown · provider credits: unknown' : ask.budget.total === null ? `App requests used: ${ask.budget.used} · no app cap · provider credits: unknown` : `App requests: ${ask.budget.remaining} of ${ask.budget.total} left (last reported) · provider credits: unknown`} />
    </div>
  );

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main-content" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:max-w-[calc(100vw-1rem)] focus:break-words focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:text-foreground">
        Skip to main content
      </a>
      <aside className="hidden lg:flex min-w-0 flex-col gap-8 overflow-y-auto bg-sidebar text-sidebar-foreground p-6 sticky top-0 h-[100dvh]">
        <Brand />
        {nav}
        <div className="mt-auto">{status}</div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 bg-sidebar text-sidebar-foreground flex items-center justify-between px-5 py-4 max-[20rem]:px-3">
        <Brand />
        <button ref={menuButton} data-testid="button-menu" onClick={() => setOpen(!open)} onKeyDown={(event) => {
          if (event.key === 'Escape' && open) { event.preventDefault(); closeMenu(); }
        }} className="p-2 -mr-2" aria-label="Menu" aria-expanded={open} aria-controls="compact-navigation">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      <div id="compact-navigation" hidden={!open} onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          closeMenu();
        }
      }} onBlur={(event) => {
        const next = event.relatedTarget;
        // A disclosure dialog is portalled outside this navigation. Keep its
        // trigger mounted so the dialog stays open and can return focus.
        if (next instanceof Element && next.closest('[role="dialog"]')) return;
        if (next && !event.currentTarget.contains(next) && next !== menuButton.current) setOpen(false);
      }} className="lg:hidden fixed inset-x-0 top-[68px] max-h-[calc(100dvh-68px)] overflow-y-auto z-30 bg-sidebar text-sidebar-foreground p-5 pt-2 space-y-5 shadow-xl">
        {open && <>{nav}{status}</>}
      </div>

      <main ref={main} id="main-content" aria-labelledby="page-title" tabIndex={-1} className="min-w-0">
        <div key={location} className="mx-auto max-w-5xl px-5 py-8 sm:px-10 sm:py-12 rise">
          {children}
        </div>
        <footer className="mx-auto max-w-5xl px-5 sm:px-10 pb-10 text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 justify-between border-t pt-6">
          <span>HireSense · A business decision tool from LV8N.</span>
          <span>Estimates only. Not financial, tax, legal or employment advice.</span>
        </footer>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
      <Mark className="h-8 w-8" />
      <div className="leading-tight max-[20rem]:sr-only">
        <div className="font-display text-lg text-white">HireSense</div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/50">by LV8N</div>
      </div>
    </Link>
  );
}

function StatusRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-sidebar-primary' : 'bg-sidebar-foreground/30 ring-2 ring-sidebar-foreground/10'}`} />
      <span className={`min-w-0 break-words ${ok ? 'text-white' : 'text-sidebar-foreground/70'}`}>{label}</span>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-10">
      <p className="text-xs uppercase tracking-[0.18em] text-accent-foreground font-medium mb-3">{eyebrow}</p>
      <h1 id="page-title" className="font-display text-3xl sm:text-4xl text-foreground max-w-2xl">{title}</h1>
      {children && <div className="contrast-secondary mt-4 text-muted-foreground max-w-2xl leading-relaxed">{children}</div>}
    </div>
  );
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'teal' | 'navy' }) {
  const t = {
    muted: 'bg-muted text-muted-foreground border-border',
    teal: 'bg-accent text-accent-foreground border-accent-foreground/20',
    navy: 'bg-primary text-primary-foreground border-primary',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}
