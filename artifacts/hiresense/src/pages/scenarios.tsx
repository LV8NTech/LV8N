import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Download, ShieldAlert, ArrowLeft, MessageSquareText, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHead, Pill } from '@/components/shell';
import { MetaExplanationPanel } from '@/components/meta-explanation-panel';
import { DisclosureList } from '@/components/disclosures';
import { HiringComparisonSummary } from '@/components/hiring-comparison-summary';
import { useInputs, PROFILES } from '@/lib/inputs-store';
import { buildHiringAdvisorExplanation, type HiringScenarioResult } from '@/lib/hiring-decision';
import { handleHorizontalScrollKeyDown } from '@/lib/horizontal-scroll';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const MODEL_LIMITS = [
  'The no-hire baseline holds the entered monthly operating cash flow constant for all 12 months.',
  'Existing payroll, operating expenses, and debt service belong in the baseline before this proposed hire.',
  'Revenue is not profit. Incremental revenue is modeled as cash receipts after the collection delay; variable costs are paid in the same month as receipts.',
  'No taxes, benefits, insurance, or other employer costs are guessed. Enter each known monthly amount separately; blank means unknown and explicit zero is valid.',
  'Employee and independent-contractor inputs are not interchangeable. This tool makes no legal worker-classification conclusion.',
  'Seasonality, financing, working capital, collection failure, and changing cash flow are not modeled. This is not an affordability decision.',
];

const Th = ({ children }: { children: ReactNode }) => (
  <th scope="col" className="px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{children}</th>
);

function neg(v: number) {
  return v < 0 ? 'cash-negative text-destructive' : '';
}

function ScenarioCard({ scenario, baseline, reserve }: { scenario: HiringScenarioResult; baseline: number[] | null; reserve: number | null }) {
  if (scenario.status === 'incomplete') {
    return (
      <section aria-labelledby={`title-${scenario.scenarioId}`} className="rounded-2xl border bg-card p-5 sm:p-6" data-testid={`scenario-${scenario.scenarioId}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`title-${scenario.scenarioId}`} className="font-display text-xl">{scenario.title}</h3>
          <Pill>Projection withheld</Pill>
        </div>
        <p className="text-sm text-muted-foreground mt-2">Add or correct the inputs below to calculate this alternative. No projected values are shown.</p>
        <p className="mt-3 text-sm font-medium">Missing or invalid requirements:</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm" data-testid={`missing-${scenario.scenarioId}`}>
          {scenario.missingInputs.map((m) => <li key={m}>{m}</li>)}
        </ul>
      </section>
    );
  }
  const p = scenario.projection;
  return (
    <section aria-labelledby={`title-${scenario.scenarioId}`} className="rounded-2xl border bg-card overflow-hidden" data-testid={`scenario-${scenario.scenarioId}`}>
      <div className="p-5 sm:p-6 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`title-${scenario.scenarioId}`} className="font-display text-xl">{p.title}</h3>
          <Pill tone="teal">12-month cash projection</Pill>
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-mono">Starts month {p.startMonth} · {money(p.monthlyCompensation)} / month compensation</p>
        <dl className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <Stat label="Cash after 12 months" value={money(p.finalEndingCash)} testId={`ending-cash-${p.scenarioId}`} tone={neg(p.finalEndingCash)} />
          <Stat label="Difference from not hiring" value={money(p.finalIncrementalCashImpact)} testId={`incremental-impact-${p.scenarioId}`} tone={neg(p.finalIncrementalCashImpact)} />
          <Stat label="Lowest month-end cash" value={money(p.lowestEndingCash)} testId={`lowest-cash-${p.scenarioId}`} tone={neg(p.lowestEndingCash)} />
          <Stat label="Months below $0" value={`${p.monthsBelowZero} of 12`} testId={`below-zero-${p.scenarioId}`} />
          <Stat label="Months below reserve" value={p.monthsBelowReserve === null ? 'Not entered' : `${p.monthsBelowReserve} of 12`} testId={`below-reserve-${p.scenarioId}`} />
        </dl>
      </div>
      <details className="group border-b" data-testid={`monthly-details-${p.scenarioId}`}>
        <summary aria-label={`${p.title}: monthly cash table, 12 rows`} className="flex cursor-pointer list-none items-center justify-between px-5 sm:px-6 py-3 text-sm font-medium text-accent-foreground hover:bg-muted/60">
          <span>Monthly cash table · 12 rows</span>
          <span className="text-xs group-open:hidden">Show</span>
          <span className="text-xs hidden group-open:inline">Hide</span>
        </summary>
        <p className="px-5 py-2 text-xs text-muted-foreground sm:hidden">
          Scroll horizontally or use the left and right arrow keys to see all columns.
        </p>
        <div
          role="region"
          className="overflow-x-auto"
          tabIndex={0}
          data-testid={`projection-scroll-${p.scenarioId}`}
          aria-label={`${p.title} monthly cash projection; use the left and right arrow keys or scroll horizontally to see all columns`}
          onKeyDown={handleHorizontalScrollKeyDown}
        >
          <table className="contrast-table min-w-[860px] w-full text-left text-xs tabular-nums font-mono">
            <caption className="sr-only">{p.title}: monthly receipts, costs, cash impact and ending cash</caption>
            <thead className="bg-muted/60 font-sans"><tr>
              <Th>Month</Th><Th>Receipts</Th><Th>Variable costs</Th><Th>Compensation</Th><Th>Employer costs</Th><Th>One-time</Th><Th>Cash impact</Th><Th>Baseline cash</Th><Th>Scenario cash</Th>{reserve !== null && <Th>Headroom vs reserve</Th>}
            </tr></thead>
            <tbody className="divide-y">
              {p.months.map((m, i) => (
                <tr key={m.month}>
                  <th scope="row" className="px-3 py-2 font-sans font-medium">{m.month}</th>
                  <td className="px-3 py-2">{money(m.incrementalRevenueReceipts)}</td>
                  <td className="px-3 py-2">{money(m.incrementalVariableCosts)}</td>
                  <td className="px-3 py-2">{money(m.compensation)}</td>
                  <td className="px-3 py-2">{money(m.explicitlyEnteredEmployerCosts)}</td>
                  <td className="px-3 py-2">{money(m.oneTimeHiringCosts)}</td>
                  <td className={`px-3 py-2 ${neg(m.incrementalCashImpact)}`}>{money(m.incrementalCashImpact)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{baseline ? money(baseline[i]) : '—'}</td>
                  <td className={`px-3 py-2 font-semibold ${neg(m.scenarioEndingCash)}`}>{money(m.scenarioEndingCash)}</td>
                  {reserve !== null && <td className={`px-3 py-2 ${neg(m.reserveHeadroom ?? 0)}`}>{m.reserveHeadroom === null ? '—' : money(m.reserveHeadroom)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="text-sm" data-testid={`limitations-${p.scenarioId}`}>
        <summary className="cursor-pointer px-5 sm:px-6 py-3 font-medium hover:bg-muted/60">Modeling notes for this path</summary>
        <ul className="list-disc space-y-1 px-5 sm:px-6 pb-4 pl-10 sm:pl-11 text-muted-foreground leading-relaxed">
          {p.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </details>
    </section>
  );
}

function Stat({ label, value, testId, tone = '' }: { label: string; value: string; testId: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono text-base tabular-nums ${tone}`} data-testid={testId}>{value}</dd>
    </div>
  );
}

export default function Scenarios() {
  const { inputs, result, profile, edited } = useInputs();
  const rawReserve = inputs.reserveTarget;
  // Display-only validation: never derive reserve counts from a negative or non-finite target.
  const reserveInvalid = rawReserve !== null && !(Number.isFinite(rawReserve) && rawReserve >= 0);
  const reserve = reserveInvalid ? null : rawReserve;
  const b = result.baseline;
  const prof = PROFILES.find((x) => x.id === profile);

  return (
    <div>
      <PageHead eyebrow="Scenarios" title="Four paths, twelve months of cash.">
        No hire, hiring at the planned start, a reduced-hours alternative, and the same hire delayed. Calculated in your browser by the imported LV8N hiring calculator. These are neutral projections, not a verdict on whether a hire is affordable.
      </PageHead>

      <p role="status" aria-label="Calculation status" aria-atomic="true" className="sr-only">
        {b ? 'Baseline calculated.' : 'Baseline projection withheld.'} {result.scenarios.filter((s) => s.status === 'calculated').length} of 3 hire projections calculated.
        {result.scenarios.some((s) => s.status === 'incomplete') && ' Missing or invalid inputs are listed under each withheld projection in Each path in detail.'}
      </p>

      <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-4">
        <div className="flex-1 min-w-[220px]">
          <p className="font-medium" data-testid="text-business-label">{inputs.businessLabel || 'Unlabeled scenario'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {prof ? `Fictional example: ${prof.name}${edited ? ' (edited)' : ''}` : 'Your own figures'} · your cash reserve target {reserveInvalid ? 'invalid' : reserve === null ? 'not entered' : money(reserve)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" data-testid="button-edit-inputs"><Link href="/inputs"><ArrowLeft className="h-3.5 w-3.5" /> Edit inputs</Link></Button>
      </div>

      <aside role="note" data-testid="synthetic-data-warning" className="contrast-notice mb-8 flex gap-3 rounded-xl border border-chart-4/50 bg-chart-4/10 px-4 py-3 text-sm">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-foreground/70" />
        <p>Estimates based on your entered figures. Keep customer details and identifying information out of questions. Not financial, legal, tax, or hiring advice.</p>
      </aside>

      <section className="space-y-4" aria-labelledby="cmp">
        <h2 id="cmp" className="font-display text-2xl">Side by side</h2>
        {b ? (
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm" data-testid="baseline-summary">
            <p><span className="text-muted-foreground">No-hire month 12 cash</span> <strong className="font-mono ml-1">{money(b.finalEndingCash)}</strong></p>
            <p><span className="text-muted-foreground">Lowest baseline cash</span> <strong className="font-mono ml-1">{money(b.lowestEndingCash)}</strong></p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card p-4" data-testid="baseline-missing">
            <p className="text-sm font-medium">Baseline projection withheld</p>
            <p className="text-sm text-muted-foreground mt-1">Missing or invalid baseline inputs:</p>
            <ul className="mt-1 list-disc pl-5 text-sm">{result.baselineMissingInputs.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {reserveInvalid && (
        <p role="status" className="contrast-notice rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="reserve-invalid">
            The cash reserve target must be a finite amount of $0 or more. Reserve comparisons are not shown until it is corrected or cleared to unknown.
          </p>
        )}
        <HiringComparisonSummary result={result} reserveTarget={reserve} />
        <p className="text-sm text-muted-foreground" data-testid="estimate-note">
          Estimates based on month-end cash. AI answers elsewhere in HireSense can be wrong; these calculated figures stay authoritative.
        </p>
        <details className="rounded-xl border bg-card text-sm" data-testid="details-definitions">
          <summary className="cursor-pointer px-4 py-3 font-medium">What these terms mean</summary>
          <dl className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
            <div><dt className="font-medium">Cash after 12 months</dt><dd className="mt-1 text-muted-foreground">Estimated cash on hand at the end of month 12 for that path.</dd></div>
            <div><dt className="font-medium">Difference from not hiring</dt><dd className="mt-1 text-muted-foreground">How much more or less cash that path leaves after 12 months, compared with making no hire.</dd></div>
            <div><dt className="font-medium">Your cash reserve target</dt><dd className="mt-1 text-muted-foreground">The cushion you entered that you would prefer cash not drop below. Months below it are counted.</dd></div>
          </dl>
        </details>
      </section>

      <section className="mt-12 space-y-5" aria-labelledby="detail">
        <h2 id="detail" className="font-display text-2xl">Each path in detail</h2>
        <section className="rounded-2xl border bg-card overflow-hidden" data-testid="scenario-no-hire">
          <div className="p-5 sm:p-6 border-b flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl">No hire (baseline)</h3>
            <Pill tone="navy">{b ? 'Constant monthly cash flow' : 'Projection withheld'}</Pill>
          </div>
          {b ? (
            <details className="group" data-testid="monthly-details-no-hire">
              <summary aria-label="No hire (baseline): monthly cash table, 12 rows" className="flex cursor-pointer list-none items-center justify-between px-5 sm:px-6 py-3 text-sm font-medium text-accent-foreground hover:bg-muted/60">
                <span>Monthly cash table · 12 rows</span>
                <span className="text-xs group-open:hidden">Show</span>
                <span className="text-xs hidden group-open:inline">Hide</span>
              </summary>
              <p className="px-5 py-2 text-xs text-muted-foreground sm:hidden">
                Scroll horizontally or use the left and right arrow keys to see all columns.
              </p>
              <div
                role="region"
                className="overflow-x-auto"
                tabIndex={0}
                data-testid="projection-scroll-no-hire"
                aria-label="No-hire baseline monthly cash; use the left and right arrow keys or scroll horizontally to see all columns"
                onKeyDown={handleHorizontalScrollKeyDown}
              >
                <table className="contrast-table min-w-[520px] w-full text-left text-xs tabular-nums font-mono">
                  <caption className="sr-only">No-hire baseline monthly ending cash</caption>
                  <thead className="bg-muted/60 font-sans"><tr><Th>Month</Th><Th>Operating cash flow</Th><Th>Ending cash</Th>{reserve !== null && <Th>Headroom vs reserve</Th>}</tr></thead>
                  <tbody className="divide-y">
                    {b.endingCash.map((c, i) => (
                      <tr key={i}>
                        <th scope="row" className="px-3 py-2 font-sans font-medium">{i + 1}</th>
                        <td className="px-3 py-2">{money(inputs.monthlyOperatingCashFlow ?? 0)}</td>
                        <td className={`px-3 py-2 font-semibold ${neg(c)}`}>{money(c)}</td>
                        {reserve !== null && <td className={`px-3 py-2 ${neg(c - reserve)}`}>{money(c - reserve)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <div className="p-5 sm:p-6 text-sm text-muted-foreground" data-testid="baseline-detail-missing">
              <p>Baseline projection withheld. Missing or invalid requirements:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.baselineMissingInputs.map((missing) => <li key={missing}>{missing}</li>)}
              </ul>
              <p className="mt-2">No monthly baseline cash table is available until these figures are corrected.</p>
            </div>
          )}
        </section>
        {result.scenarios.map((s) => (
          <ScenarioCard key={s.scenarioId} scenario={s} baseline={b?.endingCash ?? null} reserve={reserve} />
        ))}
      </section>

      <section className="mt-12" aria-labelledby="owner">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent-foreground font-medium">Written by fixed rules in your browser</p>
            <h2 id="owner" className="font-display text-2xl mt-1">Calculated summary — no AI</h2>
          </div>
          <Pill>No AI · nothing sent</Pill>
        </div>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Restates the figures above in words. No model or outside service is used, and it does not decide affordability.</p>
        <div className="mt-5 grid lg:grid-cols-3 gap-4">
          {result.scenarios.map((s) => {
            const e = buildHiringAdvisorExplanation(s);
            return (
              <article key={s.scenarioId} className="rounded-2xl border bg-card p-5" data-testid={`simulated-advice-${s.scenarioId}`}>
                <h3 className="font-display text-lg">{s.title}</h3>
                <p className="text-[11px] font-medium text-accent-foreground mt-2">{e.label}</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{e.summary}</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{e.findings.map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="text-xs font-medium mt-4">Suggested checks</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{e.nextSteps.map((n) => <li key={n}>{n}</li>)}</ul>
              </article>
            );
          })}
        </div>
      </section>

      <div className="mt-12">
        <MetaExplanationPanel />
      </div>

      <section className="mt-6 rounded-2xl border bg-primary text-primary-foreground p-6 sm:p-8 flex flex-wrap items-center gap-5" data-testid="card-ask-link">
        <MessageSquareText className="h-8 w-8 shrink-0 text-sidebar-primary" />
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-display text-2xl">Ask HireSense a question</h2>
          <p className="mt-1 text-sm opacity-80">Have a follow-up question? Ask about your own complete figures or a fictional sample. Powered by Meta Muse · Muse Spark 1.3 Standard. Only sent when you choose to.</p>
        </div>
        <Button asChild variant="secondary" data-testid="link-ask-from-scenarios"><Link href="/ask">Open Ask HireSense <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
      </section>

      <section className="mt-6 grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="font-display text-xl">Downloads</h2>
          <p className="text-sm text-muted-foreground mt-3">Exporting results is out of scope for this prototype.</p>
          <Button variant="outline" size="sm" disabled className="mt-4" data-testid="button-download" aria-label="Download results (out of scope, disabled)">
            <Download className="h-3.5 w-3.5" /> Download results
          </Button>
        </div>
      </section>

      <section className="mt-12 rounded-2xl border bg-muted/50 p-6" aria-labelledby="limits" data-testid="section-assumptions">
        <h2 id="limits" className="font-display text-xl">Assumptions and limits</h2>
        <p className="mt-2 text-sm text-muted-foreground">Estimates only, based on month-end cash. AI answers can be wrong.</p>
        <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">Show all modeling details</summary>
        <ul className="mt-3 grid md:grid-cols-2 gap-x-8 gap-y-2 list-disc pl-5 text-sm text-muted-foreground leading-relaxed">
          {MODEL_LIMITS.map((l) => <li key={l}>{l}</li>)}
        </ul>
        </details>
      </section>

      <section className="mt-8" aria-label="Disclosures" data-testid="section-disclosures">
        <h2 className="font-display text-xl mb-4">Disclosures</h2>
        <DisclosureList />
      </section>
    </div>
  );
}
