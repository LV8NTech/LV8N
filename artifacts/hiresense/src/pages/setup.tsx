import { budgetText } from '@/lib/custom-inputs';
import { Check, Minus, X, ImageIcon } from 'lucide-react';
import { PageHead } from '@/components/shell';
import { DisclosureList } from '@/components/disclosures';
import { useAsk } from '@/lib/ask-store';

const STATUS: { label: string; state: 'done' | 'no' | 'off'; d: string }[] = [
  { label: 'HireSense app shell', state: 'done', d: 'Newly built for this project: navigation, shared input form, scenario views, disclosures.' },
  { label: 'Hiring calculator', state: 'done', d: 'Original LV8N calculator imported unchanged and attributed as pre-existing code. It runs locally in this browser tab.' },
  { label: 'Calculations', state: 'done', d: 'The original calculator, boundary checks and standalone screen tests pass here.' },
  { label: 'Meta integration', state: 'off', d: 'Two explicit-request features: AI Scenario Review and Ask HireSense questions (Meta Muse, Muse Spark 1.3 Standard). Both use a server-side Meta key and require availability checking, consent, figures that complete the baseline and all three hire scenarios (your own or an optional fictional sample), and an explicit action. The business name is never sent. No demo code is needed to check availability or ask questions in this development Preview. The former demo code was separate from the provider API key, which stays on the server and must never be entered in the browser. Checking availability never sends your question, contacts Meta or uses a paid attempt. The Preview has no sign-in; anyone who can open it can send requests. Provider credit balance is unknown. Code-free access is restricted to this Preview; production access is not enabled. Nothing runs automatically. Typed Q&A has not been live-verified.' },
  { label: 'Downloads', state: 'off', d: 'Out of scope for this prototype and shown as disabled.' },
  { label: 'Original LV8N project', state: 'done', d: 'Untouched. Original files and notices are retained under vendor/hiring-tool.' },
];

const INCLUDE = [
  'Hiring calculator and its helper functions',
  'Relevant interface components',
  'Synthetic example businesses (fixtures)',
  'Meta error helper (live server integration was not supplied)',
  'Tests and their expected results',
  'Original handoff README and retained source provenance',
];
const EXCLUDE = ['Secrets, API keys or tokens', '.env files', 'Customer or real business data', 'node_modules'];

export default function Setup() {
  return (
    <div>
      <PageHead eyebrow="Setup & handoff" title="Hiring-tool import { budgetText } from '@/lib/custom-inputs';
import status.">
        The original LV8N hiring calculator runs locally. The optional Meta features have a bounded request flow, described below with the evidence available so far. Here is what was imported and what is available.
      </PageHead>

      <section className="contrast-surface rounded-2xl border bg-card divide-y mb-12">
        {STATUS.map((s) => (
          <div key={s.label} className="flex gap-4 p-5" data-testid={`status-${s.label.split(' ')[0].toLowerCase()}`}>
            <span className={`h-7 w-7 rounded-full grid place-items-center shrink-0 ${s.state === 'done' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
              {s.state === 'done' ? <Check className="h-4 w-4" /> : s.state === 'off' ? <Minus className="h-4 w-4" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <div>
              <p className="font-medium">{s.label}</p>
              <p className="contrast-secondary text-sm text-muted-foreground mt-0.5">{s.d}</p>
            </div>
          </div>
        ))}
      </section>

      <SessionAndEvidence />

      <section className="grid md:grid-cols-[220px_1fr] gap-6 mb-12">
        <div>
          <span className="font-mono text-xs text-accent-foreground">Source</span>
          <h2 className="font-display text-xl mt-1">Received source package</h2>
        </div>
        <div className="space-y-6">
          <p className="contrast-secondary text-sm leading-relaxed text-muted-foreground">
            The hiring-only ZIP was attached, inspected and imported. Original files and notices are retained. The package supports all local calculations. The optional bounded Meta adapter is new HireSense work, not part of the original export.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="contrast-surface rounded-2xl border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-accent-foreground mb-3">Received and retained</p>
              <ul className="space-y-2 text-sm">{INCLUDE.map((i) => <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-accent-foreground shrink-0 mt-0.5" />{i}</li>)}</ul>
            </div>
            <div className="contrast-surface rounded-2xl border bg-card p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-destructive mb-3">Never attach</p>
              <ul className="space-y-2 text-sm">{EXCLUDE.map((i) => <li key={i} className="flex gap-2"><X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />{i}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section id="disclosures" className="grid md:grid-cols-[220px_1fr] gap-6">
        <div>
          <span className="font-mono text-xs text-accent-foreground">Read</span>
          <h2 className="font-display text-xl mt-1">Disclosures</h2>
        </div>
        <div className="contrast-surface rounded-2xl border bg-card p-6"><DisclosureList /></div>
      </section>
    </div>
  );
}

function SessionAndEvidence() {
  const a = useAsk();
  const rows = [
    { k: 'Demo availability this session', v: a.accessApproved ? 'Checked and available' : 'Not checked', id: 'session-access' },
    { k: 'Last validated Q&A answer', v: a.lastValidated ? `${a.lastValidated.answer.model} · ${new Date(a.lastValidated.answer.completedAt).toLocaleString()}` : 'None this session', id: 'session-answer' },
    { k: 'App usage', v: `${budgetText(a.budget)}${a.budget && a.budgetStale ? ' May be out of date.' : ''}`, id: 'session-quota' },
  ];
  return (
    <section className="grid md:grid-cols-[220px_1fr] gap-6 mb-12" aria-labelledby="evidence-title">
      <div>
        <span className="font-mono text-xs text-accent-foreground">Meta</span>
        <h2 id="evidence-title" className="font-display text-xl mt-1">Session and evidence</h2>
      </div>
      <div className="space-y-4">
        <div className="contrast-surface rounded-2xl border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.14em] text-accent-foreground mb-3">This browser session only</p>
          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            {rows.map((r) => (
              <div key={r.id}><dt className="text-xs text-muted-foreground">{r.k}</dt><dd className="mt-1 font-medium break-words" data-testid={r.id}>{r.v}</dd></div>
            ))}
          </dl>
          <p className="contrast-secondary mt-3 text-xs text-muted-foreground">Kept in memory only. A refresh resets this view; it never resets server quota.</p>
        </div>
        <div className="contrast-surface rounded-2xl border bg-card p-5" data-testid="prior-evidence">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-accent-foreground mb-3"><ImageIcon className="h-3.5 w-3.5" /> Owner-provided prior evidence</p>
          <p className="text-sm leading-relaxed">
            The owner reported screenshots showing a genuine Meta response on November 4, 2026 at 9:35:34 AM, model muse-spark-1.3, with a response ID shown to the owner. The actual response ID was not provided to us.
          </p>
          <p className="contrast-secondary mt-2 text-sm text-muted-foreground">
            This is user-provided evidence for AI Scenario Review, not a test we ran. Ask HireSense questions have not been live-verified.
          </p>
        </div>
      </div>
    </section>
  );
}
