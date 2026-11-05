// Standalone adaptation of the supplied hiring-decision-demo screen tests.
// LV8N authentication and live-provider tests remain preserved in vendor/hiring-tool;
// this app deliberately has neither dependency. Financial expectations are unchanged.
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { InputsProvider } from '@/lib/inputs-store';
import Inputs from '@/pages/inputs';
import Scenarios from '@/pages/scenarios';

function mount() {
  const location = memoryLocation({ path: '/inputs' });
  const tree = <Router hook={location.hook}><InputsProvider>
    <Route path="/inputs"><Inputs /></Route>
    <Route path="/scenarios"><Scenarios /></Route>
  </InputsProvider></Router>;
  const view = render(tree);
  return {
    ...view,
    results: () => act(() => location.navigate('/scenarios')),
    inputs: () => act(() => location.navigate('/inputs')),
  };
}
const change = (key: string, value: string) =>
  fireEvent.change(screen.getByTestId(`input-${key}`), { target: { value } });
const load = (id = 'northstar') => fireEvent.click(screen.getByTestId(`load-${id}`));
const select = (key: string, value: string) =>
  fireEvent.change(screen.getByTestId(`select-${key}`), { target: { value } });

function expectPayFields(basis: 'salary' | 'hourly', full: number | null, reduced: number | null) {
  const active = basis === 'salary' ? ['annualSalary', 'reducedAnnualSalary'] : ['hourlyRate', 'reducedHourlyRate'];
  const inactive = basis === 'salary' ? ['hourlyRate', 'reducedHourlyRate'] : ['annualSalary', 'reducedAnnualSalary'];
  expect(screen.getByTestId('select-compensationBasis')).toHaveValue(basis);
  expect(screen.getByTestId(`input-${active[0]}`)).toHaveValue(full);
  expect(screen.getByTestId(`input-${active[1]}`)).toHaveValue(reduced);
  for (const key of inactive) expect(screen.queryByTestId(`input-${key}`)).not.toBeInTheDocument();
}

function expectHiringCash(full: string, reduced: string, delayed: string) {
  for (const [id, cash] of [['hire-now', full], ['reduced-hours', reduced], ['delayed-hire', delayed]]) {
    expect(screen.getByTestId(`ending-cash-${id}`)).toHaveTextContent(cash);
    expect(screen.getByTestId(`compare-row-${id}`)).toHaveTextContent(cash);
    expect(screen.getByTestId(`scenario-${id}`)).not.toHaveTextContent('Projection withheld');
  }
}

const northstarEndingCash = {
  'no-hire': '$300,000',
  'hire-now': '$309,900',
  'reduced-hours': '$303,540',
  'delayed-hire': '$301,050',
} as const;
type ScenarioId = keyof typeof northstarEndingCash;

function expectCorrectionRecovery(
  key: string,
  invalid: string,
  corrected: string,
  warning: string,
  affected: ScenarioId[],
) {
  const app = mount(); load();
  change(key, invalid);
  fireEvent.click(screen.getByTestId('button-go-scenarios'));

  for (const [id, amount] of Object.entries(northstarEndingCash)) {
    const row = screen.getByTestId(`compare-row-${id}`);
    if (affected.includes(id as ScenarioId)) {
      expect(row).toHaveTextContent('Projection withheld');
      expect(row).not.toHaveTextContent(amount);
      expect(screen.getByTestId(`scenario-${id}`)).toHaveTextContent('Projection withheld');
      const warnings = within(screen.getByTestId(`missing-${id}`)).getAllByRole('listitem');
      expect(warnings.map((item) => item.textContent)).toEqual([warning]);
      expect(screen.queryByTestId(`ending-cash-${id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`projection-scroll-${id}`)).not.toBeInTheDocument();
    } else {
      expect(row).toHaveTextContent(amount);
      expect(row).not.toHaveTextContent('Projection withheld');
      expect(screen.getByTestId(`projection-scroll-${id}`).querySelectorAll('tbody tr')).toHaveLength(12);
      if (id !== 'no-hire') {
        expect(screen.getByTestId(`ending-cash-${id}`)).toHaveTextContent(amount);
        expect(screen.getByTestId(`scenario-${id}`)).not.toHaveTextContent(warning);
      }
    }
  }

  fireEvent.click(screen.getByTestId('button-edit-inputs'));
  expect(screen.getByTestId(`input-${key}`)).toHaveValue(Number(invalid));
  change(key, corrected);
  expect(screen.getByTestId(`input-${key}`)).toHaveValue(Number(corrected));
  fireEvent.click(screen.getByTestId('button-go-scenarios'));

  expect(screen.queryByText(warning, { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('Projection withheld', { exact: true })).not.toBeInTheDocument();
  for (const [id, amount] of Object.entries(northstarEndingCash)) {
    expect(screen.getByTestId(`compare-row-${id}`)).toHaveTextContent(amount);
    expect(screen.getByTestId(`projection-scroll-${id}`).querySelectorAll('tbody tr')).toHaveLength(12);
    expect(screen.queryByTestId(`missing-${id}`)).not.toBeInTheDocument();
    if (id !== 'no-hire') expect(screen.getByTestId(`ending-cash-${id}`)).toHaveTextContent(amount);
  }
  app.unmount();
}

describe('standalone hiring screens', () => {
  it('loads both fictional profiles and keeps their actual compensation inputs editable', () => {
    mount(); load();
    expect(screen.getByTestId('input-currentCash')).toHaveValue(180000);
    expect(screen.getByTestId('select-compensationBasis')).toHaveValue('salary');
    change('annualSalary', '84000');
    expect(screen.getByTestId('input-annualSalary')).toHaveValue(84000);
    load('juniper');
    expect(screen.getByTestId('input-businessLabel')).toHaveValue('Juniper Table Kitchen — synthetic example');
    expect(screen.getByTestId('select-compensationBasis')).toHaveValue('hourly');
    expect(screen.getByTestId('input-hourlyRate')).toHaveValue(28);
    expect(screen.getByTestId('input-reducedHourlyRate')).toHaveValue(28);
  });

  it('retains Northstar expected financial outputs across all four alternatives', () => {
    const app = mount(); load(); app.results();
    for (const [id, amount, difference] of [
      ['no-hire', '$300,000', '$0'], ['hire-now', '$309,900', '$9,900'],
      ['reduced-hours', '$303,540', '$3,540'], ['delayed-hire', '$301,050', '$1,050'],
    ]) {
      const row = screen.getByTestId(`compare-row-${id}`);
      expect(row).toHaveTextContent(amount);
      expect(row).toHaveTextContent(difference);
      expect(within(row).getAllByText('0 of 12')).toHaveLength(2);
    }
    expect(screen.getByTestId('lowest-cash-hire-now')).toHaveTextContent('$177,200');
    expect(screen.getByTestId('lowest-cash-reduced-hours')).toHaveTextContent('$179,920');
  });

  it('replaces Northstar with the preserved Juniper outputs, reserve counts and deficits', () => {
    const app = mount(); load(); app.results(); app.inputs(); load('juniper'); app.results();
    for (const [id, amount, difference, reserve, zero] of [
      ['no-hire', '$19,000', '$0', '7 of 12', '0 of 12'],
      ['hire-now', '-$19,840', '-$38,840', '12 of 12', '5 of 12'],
      ['reduced-hours', '-$4,520', '-$23,520', '11 of 12', '2 of 12'],
      ['delayed-hire', '-$15,930', '-$34,930', '9 of 12', '4 of 12'],
    ]) {
      const row = screen.getByTestId(`compare-row-${id}`);
      for (const text of [amount, difference, reserve, zero]) expect(row).toHaveTextContent(text);
    }
    expect(screen.getByTestId('hiring-comparison-summary')).not.toHaveTextContent('$309,900');
  });

  it('recalculates after an edit and keeps shared inputs across view navigation', () => {
    const app = mount(); load(); app.results();
    expect(screen.getByTestId('ending-cash-hire-now')).toHaveTextContent('$309,900');
    fireEvent.click(screen.getByTestId('button-edit-inputs'));
    change('expectedMonthlyRevenue', '20000');
    fireEvent.click(screen.getByTestId('button-go-scenarios'));
    expect(screen.getByTestId('ending-cash-hire-now')).toHaveTextContent('$342,400');
    app.inputs();
    expect(screen.getByTestId('input-expectedMonthlyRevenue')).toHaveValue(20000);
  });

  it('preserves unknown versus explicit zero rather than defaulting financial blanks', () => {
    const app = mount();
    expect(screen.getByTestId('input-currentCash')).toHaveValue(null);
    change('currentCash', '0');
    expect(screen.getByTestId('status-currentCash')).toHaveTextContent('Explicit zero');
    app.results();
    expect(screen.getByTestId('baseline-missing')).not.toHaveTextContent('Current business cash');
    expect(screen.getByTestId('baseline-missing')).toHaveTextContent('Monthly operating cash flow');
    app.inputs(); change('monthlyOperatingCashFlow', '0'); app.results();
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('$0');
    app.inputs(); change('currentCash', ''); app.results();
    expect(screen.getByTestId('baseline-missing')).toHaveTextContent('Current business cash');
  });

  it.each([390, 1440])('explains every withheld projection with partial business figures at %i px', (width) => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    try {
      const app = mount();
      change('currentCash', '1200');
      expect(screen.getByTestId('input-baseline-missing')).toHaveTextContent('Monthly operating cash flow before this hire');
      expect(screen.getByTestId('input-baseline-missing')).not.toHaveTextContent('Current business cash');

      app.results();

      const baselineMissing = screen.getByTestId('baseline-missing');
      expect(baselineMissing).toHaveTextContent('Monthly operating cash flow before this hire');
      expect(screen.getByTestId('baseline-detail-missing')).toHaveTextContent('Monthly operating cash flow before this hire');
      expect(screen.queryByTestId('projection-scroll-no-hire')).not.toBeInTheDocument();
      expect(screen.queryByTestId('monthly-details-no-hire')).not.toBeInTheDocument();

      const comparison = screen.getByTestId('hiring-comparison-summary');
      expect(comparison).toHaveClass('overflow-hidden');
      expect(screen.getByRole('region', { name: /Side-by-side comparison/ })).toHaveClass('overflow-x-auto');
      expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('Projection withheld');

      for (const id of ['hire-now', 'reduced-hours', 'delayed-hire']) {
        const missing = screen.getByTestId(`missing-${id}`);
        expect(missing).toHaveTextContent('Monthly operating cash flow before this hire');
        expect(screen.getByTestId(`scenario-${id}`)).toHaveTextContent('No projected values are shown');
        expect(screen.getByTestId(`compare-row-${id}`)).toHaveTextContent('Monthly operating cash flow before this hire');
        expect(screen.getByTestId(`compare-row-${id}`)).toHaveTextContent('Projection withheld');
        expect(screen.queryByTestId(`ending-cash-${id}`)).not.toBeInTheDocument();
        expect(screen.queryByTestId(`projection-scroll-${id}`)).not.toBeInTheDocument();
      }
      expect(screen.getByTestId('compare-row-no-hire')).not.toHaveTextContent('$');
      app.unmount();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth });
    }
  });

  it('withholds only the incomplete reduced-hours scenario and names the exact missing input', () => {
    const app = mount(); load(); change('reducedAnnualSalary', ''); app.results();
    expect(screen.getByTestId('scenario-reduced-hours')).toHaveTextContent('Reduced-hours annual salary');
    expect(screen.getByTestId('scenario-reduced-hours')).toHaveTextContent('Projection withheld');
    expect(screen.queryByTestId('ending-cash-reduced-hours')).not.toBeInTheDocument();
    expect(screen.getByTestId('ending-cash-hire-now')).toHaveTextContent('$309,900');
  });

  it('withholds reserve comparisons, not cash projections, when the target is unknown', () => {
    const app = mount(); load(); change('reserveTarget', ''); app.results();
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('Reserve not entered');
    expect(screen.getByTestId('compare-row-hire-now')).toHaveTextContent('Reserve not entered');
    expect(screen.getByTestId('ending-cash-hire-now')).toHaveTextContent('$309,900');
    expect(screen.getByTestId('below-reserve-hire-now')).toHaveTextContent('Not entered');
    expect(within(screen.getByTestId('projection-scroll-hire-now')).queryByText('Headroom vs reserve')).not.toBeInTheDocument();
    app.inputs(); change('reserveTarget', '0'); app.results();
    expect(screen.getByTestId('compare-row-no-hire')).not.toHaveTextContent('Reserve not entered');
    expect(screen.getByTestId('below-reserve-hire-now')).toHaveTextContent('0 of 12');
  });

  it('does not show misleading baseline reserve counts for an invalid negative target', () => {
    const app = mount(); load(); change('reserveTarget', '-1'); app.results();
    expect(screen.getByTestId('reserve-invalid')).toHaveTextContent('$0 or more');
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('Reserve not entered');
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('Projection withheld');
  });

  it('accepts explicit zero costs, receipts and delays as real assumptions', () => {
    const app = mount(); load();
    for (const key of ['employerCostsMonthly', 'oneTimeHiringCosts', 'expectedMonthlyRevenue', 'variableCostPercent', 'collectionDelayMonths', 'delayMonths']) change(key, '0');
    app.results();
    expect(screen.getByTestId('ending-cash-hire-now')).toHaveTextContent('$228,000');
    expect(screen.getByTestId('ending-cash-delayed-hire')).toHaveTextContent('$228,000');
  });

  it('rejects incompatible contractor salary terms without inventing contractor expenses', () => {
    const app = mount(); load();
    fireEvent.change(screen.getByTestId('select-workerRelationship'), { target: { value: 'independent-contractor' } });
    expect(screen.getByTestId('contractor-salary-unsupported')).toHaveTextContent('not interchangeable');
    expect(screen.getByLabelText('Additional contractor-engagement costs')).toBeInTheDocument();
    app.results();
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('Projection withheld');
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('fixed-fee contractor terms are not modeled');
  });

  it('explains invalid timing and cost percentages and does not show stale results', () => {
    const app = mount(); load(); change('plannedStartMonth', '0'); change('variableCostPercent', '101'); app.results();
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('whole month from 1 to 12');
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('between 0 and 100');
    expect(screen.queryByTestId('ending-cash-hire-now')).not.toBeInTheDocument();
  });

  describe.each([
    {
      key: 'delayMonths', corrected: '3',
      warning: 'Delay period must be a whole number from 0 to 12',
      affected: ['delayed-hire'] as ScenarioId[],
    },
    {
      key: 'collectionDelayMonths', corrected: '1',
      warning: 'Revenue collection delay must be a whole number from 0 to 12',
      affected: ['hire-now', 'delayed-hire'] as ScenarioId[],
    },
    {
      key: 'reducedCollectionDelayMonths', corrected: '1',
      warning: 'Reduced-hours revenue collection delay must be a whole number from 0 to 12',
      affected: ['reduced-hours'] as ScenarioId[],
    },
  ])('$key correction', ({ key, corrected, warning, affected }) => {
    it.each(['1.5', '-1', '13'])('restores results after invalid delay %s without stale warnings', (invalid) => {
      expectCorrectionRecovery(key, invalid, corrected, warning, affected);
    });
  });

  it.each([
    {
      key: 'employerCostsMonthly', corrected: '800',
      warning: 'Monthly employer costs or benefits cannot be negative',
      affected: ['hire-now', 'delayed-hire'] as ScenarioId[],
    },
    {
      key: 'oneTimeHiringCosts', corrected: '6000',
      warning: 'One-time hiring costs cannot be negative',
      affected: ['hire-now', 'delayed-hire'] as ScenarioId[],
    },
    {
      key: 'reducedEmployerCostsMonthly', corrected: '480',
      warning: 'Reduced-hours monthly employer costs cannot be negative',
      affected: ['reduced-hours'] as ScenarioId[],
    },
    {
      key: 'reducedOneTimeHiringCosts', corrected: '6000',
      warning: 'Reduced-hours one-time hiring costs cannot be negative',
      affected: ['reduced-hours'] as ScenarioId[],
    },
  ])('restores results after correcting negative $key without stale warnings', ({ key, corrected, warning, affected }) => {
    expectCorrectionRecovery(key, '-1', corrected, warning, affected);
  });

  it('keeps compensation alternatives conditional and exposes original unit bounds', () => {
    mount(); load();
    expect(screen.queryByTestId('input-hourlyRate')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-annualSalary')).toBeInTheDocument();
    expect(screen.getByTestId('input-currentCash')).toHaveAttribute('min', '0');
    expect(screen.getByTestId('input-plannedStartMonth')).toHaveAttribute('min', '1');
    expect(screen.getByTestId('input-variableCostPercent')).toHaveAttribute('max', '100');
    expect(screen.getByTestId('input-monthlyOperatingCashFlow')).not.toHaveAttribute('min');
    load('juniper');
    expect(screen.queryByTestId('input-annualSalary')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-hourlyRate')).toHaveValue(28);
  });

  it('switches salary to hourly and back without losing drafts or using inactive salary terms', () => {
    const app = mount(); load();
    change('annualSalary', '84000');
    change('reducedAnnualSalary', '48000');
    expectPayFields('salary', 84000, 48000);
    app.results();
    expectHiringCash('$297,900', '$298,740', '$292,050');

    app.inputs(); select('compensationBasis', 'hourly');
    expectPayFields('hourly', null, null);
    expect(screen.getByTestId('active-compensation-basis')).toHaveTextContent('Active input: hourly rate');
    app.results();
    // Retained salaries must not fill missing hourly terms in any alternative.
    for (const id of ['hire-now', 'reduced-hours', 'delayed-hire']) {
      expect(screen.getByTestId(`scenario-${id}`)).toHaveTextContent('Projection withheld');
      expect(screen.queryByTestId(`ending-cash-${id}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('missing-hire-now')).toHaveTextContent('Hourly rate');
    expect(screen.getByTestId('missing-reduced-hours')).toHaveTextContent('Reduced-hours hourly rate');

    app.inputs(); change('hourlyRate', '30'); change('reducedHourlyRate', '20');
    app.results();
    // Full pay: 30 × 40 × 52 / 12 = 5,200/month; reduced: 20 × 24 × 52 / 12 = 2,080.
    expectHiringCash('$319,500', '$321,780', '$308,250');
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('$300,000');

    app.inputs(); select('compensationBasis', 'salary');
    expectPayFields('salary', 84000, 48000);
    expect(screen.getByTestId('active-compensation-basis')).toHaveTextContent('Active input: annual salary');
    app.results();
    expectHiringCash('$297,900', '$298,740', '$292,050');
    app.inputs(); select('compensationBasis', 'hourly');
    expectPayFields('hourly', 30, 20);
    app.results();
    expectHiringCash('$319,500', '$321,780', '$308,250');
  });

  it('switches hourly to salary and back without borrowing or overwriting hourly drafts', () => {
    const app = mount(); load('juniper'); app.results();
    expectHiringCash('-$19,840', '-$4,520', '-$15,930');
    app.inputs(); select('compensationBasis', 'salary');
    expectPayFields('salary', null, null);
    app.results();
    for (const id of ['hire-now', 'reduced-hours', 'delayed-hire']) {
      expect(screen.getByTestId(`scenario-${id}`)).toHaveTextContent('Projection withheld');
      expect(screen.queryByTestId(`ending-cash-${id}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('missing-hire-now')).toHaveTextContent('Annual salary');
    expect(screen.getByTestId('missing-reduced-hours')).toHaveTextContent('Reduced-hours annual salary');

    app.inputs(); change('annualSalary', '60000'); change('reducedAnnualSalary', '24000');
    app.results();
    // Explicit salaries give 5,000/month and 2,000/month, not the retained hourly costs.
    expectHiringCash('-$21,600', '$600', '-$17,250');
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('$19,000');

    app.inputs(); select('compensationBasis', 'hourly');
    expectPayFields('hourly', 28, 28);
    app.results();
    expectHiringCash('-$19,840', '-$4,520', '-$15,930');
    app.inputs(); select('compensationBasis', 'salary');
    expectPayFields('salary', 60000, 24000);
    app.results();
    expectHiringCash('-$21,600', '$600', '-$17,250');
  });

  it('withholds contractor salary after relationship switches and restores only the active pay basis', () => {
    const app = mount(); load();
    select('compensationBasis', 'hourly');
    change('hourlyRate', '30'); change('reducedHourlyRate', '20');
    select('workerRelationship', 'independent-contractor');
    expectPayFields('hourly', 30, 20);
    expect(screen.getByTestId('contractor-treatment-note')).toBeInTheDocument();
    expect(screen.queryByTestId('contractor-salary-unsupported')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Additional contractor-engagement costs')).toHaveValue(800);
    expect(screen.getByLabelText('Reduced-hours contractor-engagement costs')).toHaveValue(480);
    app.results();
    expectHiringCash('$319,500', '$321,780', '$308,250');

    app.inputs(); select('compensationBasis', 'salary');
    expectPayFields('salary', 72000, 43200);
    expect(screen.getByTestId('contractor-salary-unsupported')).toHaveTextContent('not interchangeable');
    expect(screen.getByTestId('text-calculated-count')).toHaveTextContent('0/3 calculated');
    app.results();
    for (const id of ['hire-now', 'reduced-hours', 'delayed-hire']) {
      expect(screen.getByTestId(`scenario-${id}`)).toHaveTextContent('Projection withheld');
      expect(screen.getByTestId(`missing-${id}`)).toHaveTextContent('fixed-fee contractor terms are not modeled');
      expect(screen.getByTestId(`compare-row-${id}`)).toHaveTextContent('Projection withheld');
      expect(screen.getByTestId(`compare-row-${id}`)).not.toHaveTextContent('$');
      expect(screen.queryByTestId(`ending-cash-${id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`projection-scroll-${id}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('compare-row-no-hire')).toHaveTextContent('$300,000');

    app.inputs(); select('workerRelationship', 'employee');
    expectPayFields('salary', 72000, 43200);
    expect(screen.queryByTestId('contractor-salary-unsupported')).not.toBeInTheDocument();
    expect(screen.queryByTestId('contractor-treatment-note')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Employer costs or benefits')).toHaveValue(800);
    app.results();
    expectHiringCash('$309,900', '$303,540', '$301,050');

    app.inputs(); select('workerRelationship', 'independent-contractor');
    expect(screen.getByTestId('contractor-salary-unsupported')).toBeInTheDocument();
    select('compensationBasis', 'hourly');
    expectPayFields('hourly', 30, 20);
    expect(screen.queryByTestId('contractor-salary-unsupported')).not.toBeInTheDocument();
    app.results();
    expectHiringCash('$319,500', '$321,780', '$308,250');
    app.inputs(); select('workerRelationship', 'employee');
    expectPayFields('hourly', 30, 20);
    app.results();
    expectHiringCash('$319,500', '$321,780', '$308,250');
  });

  it('renders twelve monthly rows and scrollable cash projections for all four paths', () => {
    const app = mount(); load(); app.results();
    for (const id of ['no-hire', 'hire-now', 'reduced-hours', 'delayed-hire']) {
      const table = screen.getByTestId(`projection-scroll-${id}`);
      expect(table).toHaveClass('overflow-x-auto');
      expect(table).toHaveAttribute('tabindex', '0');
      expect(table.querySelectorAll('tbody tr')).toHaveLength(12);
    }
    const rows = screen.getByTestId('projection-scroll-hire-now').querySelectorAll('tbody tr');
    expect(rows[0]).toHaveTextContent('$177,200');
    expect(rows[0]).toHaveTextContent('$117,200');
    expect(rows[11]).toHaveTextContent('$309,900');
  });

  it('never sends automatic network requests and clearly separates local text from the explicit Meta action', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network'));
    const app = mount(); load(); change('expectedMonthlyRevenue', '15500'); app.results();
    expect(screen.getByTestId('simulated-advice-hire-now')).toHaveTextContent('no Meta request was made');
    expect(screen.getByTestId('meta-status')).toHaveTextContent('Check demo availability first');
    expect(screen.getByTestId('meta-custom-ready')).toBeInTheDocument();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(screen.getByTestId('button-download')).toBeDisabled();
    app.inputs(); load('juniper'); app.results();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears all assumptions on reset and on a fresh app mount (refresh)', () => {
    const app = mount(); load(); fireEvent.click(screen.getByTestId('clear-scenario'));
    expect(screen.getByTestId('input-currentCash')).toHaveValue(null);
    app.results(); expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('Projection withheld');
    app.inputs(); load(); app.unmount();
    mount();
    expect(screen.getByTestId('input-currentCash')).toHaveValue(null);
    expect(screen.getByTestId('select-compensationBasis')).toHaveValue('');
  });
});
