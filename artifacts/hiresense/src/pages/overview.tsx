import { Link } from 'wouter';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/shell';
import { DisclosuresDialog } from '@/components/disclosures';
import { useInputs, countProvided, TOTAL_FIELDS } from '@/lib/inputs-store';

const STEPS = [
  { n: '01', t: 'Enter your figures once', d: 'Cash, cash flow before the hire, an optional reserve target, pay, hours, timing and expected receipts.', href: '/inputs', state: 'Available now' },
  { n: '02', t: 'Compare four paths', d: 'No hire, planned hire, reduced hours and delayed hire, side by side, using the same figures.', href: '/scenarios', state: 'Calculated locally' },
  { n: '03', t: 'Read the calculated summary', d: 'A plain-language summary written by fixed rules (no AI), monthly tables, and the disclosures.', href: '/scenarios', state: 'Calculated locally' },
];

export default function Overview() {
  const { inputs } = useInputs();
  const n = countProvided(inputs);
  return (
    <div>
      <section data-testid="overview-hero" className="contrast-surface overview-hero relative overflow-hidden rounded-3xl bg-sidebar text-sidebar-foreground px-7 py-12 sm:px-12 sm:py-16">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[40px] border-sidebar-primary/15" />
        <div className="absolute right-16 bottom-10 h-24 w-24 rounded-full bg-sidebar-primary/20" />
        <div className="relative max-w-2xl">
          <Pill tone="teal">Runs in your browser · no login</Pill>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.05] text-white mt-6">
            Know what your next hire means for your business.
          </h1>
          <p className="contrast-secondary mt-5 text-sidebar-foreground/75 text-lg leading-relaxed max-w-xl">
            A calm place to think through a hire in terms of cash, reserves and growth. Your figures, your reserve target, and plain English about what is known and what is not.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" data-testid="button-start-inputs">
              <Link href="/inputs">
                {n ? 'Continue your inputs' : 'Start with your figures'} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/25 hover:bg-white/10 hover:text-white" data-testid="button-view-setup">
              <Link href="/ask">Ask about a sample</Link>
            </Button>
          </div>
          <p className="contrast-secondary mt-10 text-xs uppercase tracking-[0.18em] text-sidebar-foreground/45">A business decision tool from LV8N.</p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl mb-6">How it works</h2>
        <div className="grid md:grid-cols-[1.2fr_1fr_1fr] gap-4">
          {STEPS.map((s, i) => (
            <Link
              key={s.n}
              href={s.href}
              data-testid={`card-step-${s.n}`}
              className={`contrast-surface group rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-18px_hsl(216_55%_18%/0.4)] ${i === 0 ? 'bg-card' : 'bg-card/60 hatch'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-accent-foreground">{s.n}</span>
                <Pill tone={i === 0 ? 'teal' : 'muted'}>{s.state}</Pill>
              </div>
              <h3 className="font-display text-xl mt-6">{s.t}</h3>
              <p className="contrast-secondary text-sm text-muted-foreground mt-2 leading-relaxed">{s.d}</p>
              {i === 0 && <p className="contrast-secondary text-xs mt-5 font-mono text-muted-foreground">{n} of {TOTAL_FIELDS} fields entered</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14 grid md:grid-cols-2 gap-8 border-t pt-10">
        <div>
          <h2 className="font-display text-2xl">What HireSense can and cannot do</h2>
          <p className="contrast-secondary text-sm text-muted-foreground mt-3 leading-relaxed">
            HireSense calculates everything in your browser. Missing inputs withhold a projection rather than being estimated, and no result is an affordability verdict.
          </p>
          <p className="contrast-secondary text-sm text-muted-foreground mt-3">Build, import and provenance details are on <Link href="/setup" className="underline underline-offset-4" data-testid="link-overview-setup">Setup &amp; handoff</Link>.</p>
          <DisclosuresDialog
            trigger={
              <button data-testid="button-open-disclosures" className="mt-4 text-sm text-accent-foreground underline underline-offset-4 decoration-accent-foreground/40 hover:decoration-accent-foreground">
                Read the disclosures
              </button>
            }
          />
        </div>
        <ul className="space-y-3 text-sm">
          {[
            [true, 'Enter and edit temporary inputs, kept only in this tab'],
            [true, 'Load two clearly labeled fictional example businesses'],
            [true, 'No-hire baseline plus three scenarios, month by month'],
            [true, 'Calculated summary written by fixed rules (no AI)'],
            [true, 'Optional questions about your own figures or a fictional sample, sent only when you choose'],
            [false, 'Downloadable results (out of scope)'],
          ].map(([ok, t]) => (
            <li key={t as string} className="flex gap-3 items-start">
              {ok ? <Check className="h-4 w-4 text-accent-foreground mt-0.5 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />}
              <span className={ok ? '' : 'text-muted-foreground'}>{t}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
