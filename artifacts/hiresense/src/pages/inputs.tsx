import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, RotateCcw, Info, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHead, Pill } from '@/components/shell';
import { useInputs, countProvided, TOTAL_FIELDS, PROFILES } from '@/lib/inputs-store';
import type { HiringDecisionInputs, HiringInputKey } from '@/lib/hiring-decision';

type Unit = 'usd' | 'usd/mo' | 'usd/yr' | 'usd/hr' | 'hours' | 'month' | 'months' | 'pct';
type NumField = {
  key: HiringInputKey;
  label: string;
  hint: string;
  unit: Unit;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
  note?: string;
  show?: (i: HiringDecisionInputs) => boolean;
  contractorLabel?: string;
  contractorHint?: string;
};

const PREFIX: Record<Unit, string> = { usd: '$', 'usd/mo': '$', 'usd/yr': '$', 'usd/hr': '$', hours: '', month: 'Month', months: '', pct: '' };
const SUFFIX: Record<Unit, string> = { usd: '', 'usd/mo': '/ month', 'usd/yr': '/ year', 'usd/hr': '/ hour', hours: 'hrs / week', month: 'of 1–12', months: 'months', pct: '%' };
const UNIT_DESCRIPTION: Record<Unit, string> = {
  usd: 'US dollars.', 'usd/mo': 'US dollars per month.', 'usd/yr': 'US dollars per year.',
  'usd/hr': 'US dollars per hour.', hours: 'Hours per week.', month: 'Month number, 1 through 12.',
  months: 'Number of months.', pct: 'Percent.',
};

function boundDescription(field: NumField) {
  const wholeNumber = field.step === 1 ? ' (whole numbers)' : '';
  if (field.min !== undefined && field.max !== undefined) {
    return `Allowed range: ${field.min}–${field.max}${wholeNumber}.`;
  }
  if (field.min !== undefined) return `Minimum: ${field.min} or more${wholeNumber}.`;
  if (field.max !== undefined) return `Maximum: ${field.max}${wholeNumber}.`;
  return null;
}

const salary = (i: HiringDecisionInputs) => i.compensationBasis === 'salary';
const hourly = (i: HiringDecisionInputs) => i.compensationBasis === 'hourly';

const BUSINESS: NumField[] = [
  { key: 'currentCash', label: 'Current business cash', hint: 'Available cash today.', unit: 'usd', min: 0 },
  { key: 'monthlyOperatingCashFlow', label: 'Monthly operating cash flow before this hire', hint: 'Cash in minus cash out per month, held constant for 12 months. Can be negative.', unit: 'usd/mo', note: 'Existing payroll, operating costs and debt payments belong here. Only the proposed hire is added below.' },
  { key: 'reserveTarget', label: 'Your cash reserve target', hint: 'Your own desired minimum cash. Optional; without it, reserve comparisons are not shown.', unit: 'usd', min: 0, optional: true },
];

const HIRE: NumField[] = [
  { key: 'annualSalary', label: 'Annual salary', hint: 'Per year. Salary basis only.', unit: 'usd/yr', min: 0, show: salary },
  { key: 'hourlyRate', label: 'Hourly rate', hint: 'Per hour. Hourly basis only.', unit: 'usd/hr', min: 0, show: hourly },
  { key: 'regularHoursPerWeek', label: 'Regular hours', hint: 'Hours per week. Hourly pay is rate x hours x 52 / 12.', unit: 'hours', min: 0.1, step: 0.1 },
  { key: 'employerCostsMonthly', label: 'Employer costs or benefits', hint: 'Per month. Enter the known total; no estimate is added.', unit: 'usd/mo', min: 0, contractorLabel: 'Additional contractor-engagement costs', contractorHint: 'Per month. Known business costs tied to this engagement.' },
  { key: 'oneTimeHiringCosts', label: 'One-time hiring costs', hint: 'Paid once, in the start month.', unit: 'usd', min: 0 },
  { key: 'plannedStartMonth', label: 'Planned start month', hint: 'Month 1 is the first projected month. Whole months 1–12.', unit: 'month', min: 1, max: 12, step: 1 },
  { key: 'delayMonths', label: 'Delay before same hire', hint: 'Used by the delayed scenario only. Whole months 0–12.', unit: 'months', min: 0, max: 12, step: 1 },
];

const REVENUE: NumField[] = [
  { key: 'expectedMonthlyRevenue', label: 'Expected incremental revenue', hint: 'Per month. Modeled as cash receipts, not profit.', unit: 'usd/mo', min: 0 },
  { key: 'variableCostPercent', label: 'Variable costs', hint: 'Percent of incremental receipts, paid in the same month. 0–100.', unit: 'pct', min: 0, max: 100, step: 0.1 },
  { key: 'revenueStartMonth', label: 'Revenue starts', hint: 'Month 1–12, before the collection delay.', unit: 'month', min: 1, max: 12, step: 1 },
  { key: 'collectionDelayMonths', label: 'Collection delay', hint: 'Whole months between revenue starting and cash arriving. 0–12.', unit: 'months', min: 0, max: 12, step: 1 },
];

const REDUCED: NumField[] = [
  { key: 'reducedHoursPerWeek', label: 'Reduced-hours schedule', hint: 'Hours per week. Must be lower than regular hours.', unit: 'hours', min: 0.1, step: 0.1 },
  { key: 'reducedAnnualSalary', label: 'Reduced-hours annual salary', hint: 'Per year. Entered separately; not prorated for you.', unit: 'usd/yr', min: 0, show: salary },
  { key: 'reducedHourlyRate', label: 'Reduced-hours hourly rate', hint: 'Per hour. Entered separately.', unit: 'usd/hr', min: 0, show: hourly },
  { key: 'reducedEmployerCostsMonthly', label: 'Reduced-hours employer costs or benefits', hint: 'Per month. Separate known amount.', unit: 'usd/mo', min: 0, contractorLabel: 'Reduced-hours contractor-engagement costs', contractorHint: 'Per month. Separate known costs for this engagement.' },
  { key: 'reducedOneTimeHiringCosts', label: 'Reduced-hours one-time hiring costs', hint: 'Paid once, in the start month.', unit: 'usd', min: 0 },
  { key: 'reducedExpectedMonthlyRevenue', label: 'Reduced-hours incremental revenue', hint: 'Per month. Receipts, not profit. Not scaled for you.', unit: 'usd/mo', min: 0 },
  { key: 'reducedVariableCostPercent', label: 'Reduced-hours variable costs', hint: 'Percent of receipts. 0–100.', unit: 'pct', min: 0, max: 100, step: 0.1 },
  { key: 'reducedRevenueStartMonth', label: 'Reduced-hours revenue starts', hint: 'Month 1–12, before collection delay.', unit: 'month', min: 1, max: 12, step: 1 },
  { key: 'reducedCollectionDelayMonths', label: 'Reduced-hours collection delay', hint: 'Whole months. 0–12.', unit: 'months', min: 0, max: 12, step: 1 },
];

const selectCls = 'contrast-select w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring';

export default function InputsPage() {
  const { inputs, setField, loadProfile, reset, profile, edited, result } = useInputs();
  const n = countProvided(inputs);
  const contractor = inputs.workerRelationship === 'independent-contractor';
  const calculated = result.scenarios.filter((s) => s.status === 'calculated').length;
  const activeProfile = PROFILES.find((p) => p.id === profile);

  function row(f: NumField) {
    if (f.show && !f.show(inputs)) return null;
    const v = inputs[f.key] as number | null;
    const id = `input-${f.key}`;
    const state = v === null ? 'Unknown' : v === 0 ? 'Explicit zero' : 'Entered';
    const label = contractor && f.contractorLabel ? f.contractorLabel : f.label;
    const hint = contractor && f.contractorHint ? f.contractorHint : f.hint;
    const bounds = boundDescription(f);
    return (
      <div key={f.key} className="p-5 sm:p-6 grid sm:grid-cols-[1fr_240px] gap-4 items-start">
        <div>
          <label htmlFor={id} className="font-medium flex items-center gap-2 flex-wrap">
            {label} {f.optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
          </label>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground mt-1 leading-relaxed">{hint}</p>
          {bounds && <p id={`${id}-range`} className="text-xs text-muted-foreground mt-1">{bounds}</p>}
          <span id={`${id}-unit`} className="sr-only">{UNIT_DESCRIPTION[f.unit]}</span>
          {f.note && (
            <p id={`${id}-note`} className="text-xs text-accent-foreground mt-2 flex gap-1.5 items-start">
              <Info className="h-3.5 w-3.5 mt-px shrink-0" /> {f.note}
            </p>
          )}
        </div>
        <div>
          <div className="contrast-input-boundary flex items-center rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-ring transition-shadow">
            {PREFIX[f.unit] && <span aria-hidden="true" className="pl-3 text-muted-foreground text-sm">{PREFIX[f.unit]}</span>}
            <input
              id={id}
              aria-describedby={`${id}-hint${bounds ? ` ${id}-range` : ''} ${id}-unit ${id}-status${f.note ? ` ${id}-note` : ''}`}
              data-testid={id}
              inputMode="decimal"
              type="number"
              min={f.min}
              max={f.max}
              step={f.step ?? 'any'}
              value={v === null ? '' : v}
              placeholder="Unknown"
              onChange={(e) => setField(f.key, (e.target.value === '' ? null : Number(e.target.value)) as never)}
              className="w-full min-w-0 bg-transparent px-2.5 py-2.5 font-mono text-[15px] outline-none placeholder:text-muted-foreground/60 placeholder:font-sans [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            {SUFFIX[f.unit] && <span aria-hidden="true" className="pr-3 text-xs text-muted-foreground whitespace-nowrap">{SUFFIX[f.unit]}</span>}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span id={`${id}-status`} data-testid={`status-${f.key}`} className={`text-[11px] ${state === 'Unknown' ? 'text-muted-foreground' : 'text-accent-foreground'}`}>{state}</span>
            {v !== null && (
              <button type="button" onClick={() => {
                setField(f.key, null as never);
                document.getElementById(id)?.focus();
              }} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2" data-testid={`button-clear-${f.key}`} aria-label={`Mark ${label} unknown`}>
                Mark unknown
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const group = (no: string, title: string, intro: string, body: ReactNode) => (
    <section className="grid md:grid-cols-[220px_1fr] gap-6">
      <div>
        <span className="font-mono text-xs text-accent-foreground">{no}</span>
        <h2 className="font-display text-xl mt-1">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{intro}</p>
      </div>
      <div className="rounded-2xl border bg-card divide-y min-w-0">{body}</div>
    </section>
  );

  return (
    <div>
      <PageHead eyebrow="Business inputs" title="Enter your figures once.">
        Every scenario reads from these same figures and recalculates as you type. A blank field means unknown. A zero means you deliberately mean zero. Nothing is estimated for you.
      </PageHead>

      <aside role="note" data-testid="synthetic-data-warning" className="contrast-notice mb-6 flex gap-3 rounded-xl border border-chart-4/50 bg-chart-4/10 px-4 py-3 text-sm">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-foreground/70" />
        <p><span className="font-medium">Use your business figures or a fictional example.</span> Avoid customer details, names and credentials. Values stay in this tab's memory and clear on refresh. Only a deliberate AI request with consent sends calculator figures to Meta. Not financial, legal, tax, or hiring advice.</p>
      </aside>

      <div className="sticky top-[68px] lg:top-0 z-20 -mx-5 px-5 sm:mx-0 sm:px-0 py-3 bg-background/90 backdrop-blur mb-8">
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3 mr-auto">
            <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-chart-1 transition-transform duration-500 origin-left" style={{ transform: `scaleX(${n / TOTAL_FIELDS})` }} />
            </div>
            <span className="text-xs font-mono text-muted-foreground" data-testid="text-progress">{n}/{TOTAL_FIELDS} entered</span>
            <span className="text-xs font-mono text-muted-foreground" data-testid="text-calculated-count">{calculated}/3 calculated</span>
          </div>
          {PROFILES.map((p) => (
            <Button key={p.id} variant={profile === p.id ? 'default' : 'outline'} size="sm" onClick={() => loadProfile(p.id)} data-testid={p.id === 'northstar-studio' ? 'load-northstar' : 'load-juniper'} aria-label={`Load fictional example: ${p.name}`}>
              {p.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={reset} data-testid="clear-scenario" aria-label="Clear all inputs to blank">
            <RotateCcw className="h-3.5 w-3.5" /> Clear to blank
          </Button>
        </div>
      </div>

      {result.baselineMissingInputs.length > 0 && (
        <section
          className="mb-8 rounded-xl border border-dashed bg-card p-4"
          data-testid="input-baseline-missing"
          aria-labelledby="input-baseline-missing-title"
        >
          <h2 id="input-baseline-missing-title" className="text-sm font-medium">Baseline projection withheld</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter or correct these business figures to calculate the no-hire baseline:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.baselineMissingInputs.map((missing) => <li key={missing}>{missing}</li>)}
          </ul>
        </section>
      )}

      <p role="status" aria-atomic="true" className="sr-only">
        {calculated} of 3 hire projections calculated. {calculated < 3 ? 'Missing or invalid inputs: view scenarios for the requirements for each withheld projection.' : 'All hire projections are available.'}
      </p>

      {activeProfile && (
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-accent-foreground/20 bg-accent px-4 py-3 text-sm text-accent-foreground" data-testid="status-demo">
          <Pill tone="teal">Fictional example</Pill>
          <p className="flex-1 min-w-[220px]">
            {activeProfile.name} is a fictional business{edited ? ', now edited by you' : ''}. Its values are not real data, not typical figures, and its reserve target is not a recommendation.
          </p>
        </div>
      )}

      <div className="space-y-12">
        {group('00', 'Scenario label', 'A name only. Synthetic wording is recommended.', (
          <div className="p-5 sm:p-6">
            <label htmlFor="input-businessLabel" className="font-medium">Business label</label>
            <input id="input-businessLabel" data-testid="input-businessLabel" type="text" value={inputs.businessLabel} onChange={(e) => setField('businessLabel', e.target.value)} className={`${selectCls} mt-2`} />
          </div>
        ))}

        {group('01', 'Your business today', 'Where cash stands before anyone new joins.', BUSINESS.map(row))}

        {group('02', 'The proposed hire', 'What the role costs, split so nothing is counted twice.', (
          <>
            <div className="p-5 sm:p-6 grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="select-workerRelationship" className="font-medium">Worker relationship</label>
                <select id="select-workerRelationship" aria-describedby="worker-relationship-hint" data-testid="select-workerRelationship" value={inputs.workerRelationship ?? ''} onChange={(e) => setField('workerRelationship', (e.target.value || null) as HiringDecisionInputs['workerRelationship'])} className={`${selectCls} mt-2`}>
                  <option value="">Choose one</option>
                  <option value="employee">Employee</option>
                  <option value="independent-contractor">Independent contractor</option>
                </select>
                <p id="worker-relationship-hint" className="text-xs text-muted-foreground mt-1.5">Distinct options. This tool does not determine legal classification.</p>
              </div>
              <div>
                <label htmlFor="select-compensationBasis" className="font-medium">Compensation basis</label>
                <select id="select-compensationBasis" aria-describedby="compensation-basis-hint" data-testid="select-compensationBasis" value={inputs.compensationBasis ?? ''} onChange={(e) => setField('compensationBasis', (e.target.value || null) as HiringDecisionInputs['compensationBasis'])} className={`${selectCls} mt-2`}>
                  <option value="">Choose one</option>
                  <option value="salary">Salary (annual)</option>
                  <option value="hourly">Hourly</option>
                </select>
                <p id="compensation-basis-hint" className="text-xs text-muted-foreground mt-1.5" data-testid="active-compensation-basis">
                  {inputs.compensationBasis ? `Active input: ${salary(inputs) ? 'annual salary' : 'hourly rate'}. The other basis is not used.` : 'Choose a basis to show its pay field.'}
                </p>
              </div>
              {contractor && (
                <p className="contrast-notice sm:col-span-2 rounded-lg border border-chart-4/50 bg-chart-4/10 p-3 text-sm" data-testid="contractor-treatment-note">
                  Contractor projections use only the amounts explicitly entered here. The prototype does not infer or equate contractor and employee tax, payroll, benefit, or legal treatment, and does not determine worker classification.
                </p>
              )}
              {contractor && salary(inputs) && (
                <p role="status" className="contrast-notice sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium" data-testid="contractor-salary-unsupported">
                  Fixed-fee contractor terms are not supported. Salary and contractor fees are not interchangeable; cash projections for this combination are withheld.
                </p>
              )}
            </div>
            {HIRE.map(row)}
          </>
        ))}

        {group('03', 'What the hire might bring in', 'Your own expectation. Leave blank if you do not know yet.', REVENUE.map(row))}

        {group('04', 'Reduced-hours alternative', 'A separate schedule and cost set. Pay and revenue are not prorated from the full role; enter each one yourself.', REDUCED.map(row))}
      </div>

      <div className="mt-12 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground mb-1">Where these go</p>
        These are the full inputs of the imported hiring calculator. Values are kept only in this tab's memory, shared across pages, and clear on refresh. Nothing is saved or sent.
      </div>

      <div className="mt-8 flex justify-end">
        <Button asChild size="lg" data-testid="button-go-scenarios">
          <Link href="/scenarios">View scenarios <ArrowRight className="h-4 w-4" /></Link>
        </Button>
      </div>
    </div>
  );
}
