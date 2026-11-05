import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { checkHiringDemoAccess, requestHiringExplanation } from '@workspace/api-client-react';
import { InputsProvider, useInputs } from '@/lib/inputs-store';
import { Shell } from '@/components/shell';
import { DISCLOSURES } from '@/components/disclosures';
import { MetaExplanationPanel } from '@/components/meta-explanation-panel';
import Inputs from '@/pages/inputs';
import Scenarios from '@/pages/scenarios';
import Overview from '@/pages/overview';
import Setup from '@/pages/setup';

vi.mock('@workspace/api-client-react', () => ({
  checkHiringDemoAccess: vi.fn(),
  requestHiringExplanation: vi.fn(),
}));
const mockedDemoAccessCheck = vi.mocked(checkHiringDemoAccess);
const mockedHiringExplanationRequest = vi.mocked(requestHiringExplanation);

function mount(withShell = false) {
  const location = memoryLocation({ path: '/inputs' });
  const pages = <>
    <Route path="/inputs"><Inputs /></Route>
    <Route path="/scenarios"><Scenarios /></Route>
  </>;
  render(<Router hook={location.hook}><InputsProvider>
    {withShell ? <Shell>{pages}</Shell> : pages}
  </InputsProvider></Router>);
  return {
    results: () => act(() => location.navigate('/scenarios')),
    inputs: () => act(() => location.navigate('/inputs')),
  };
}

function MetaExplanationAccessibilityFixture() {
  const { loadProfile } = useInputs();
  return <>
    <button onClick={() => loadProfile('northstar-studio')}>Load Northstar</button>
    <MetaExplanationPanel />
  </>;
}

function expectInlineDisclosures(section: HTMLElement) {
  const list = within(section).getByRole('list');
  expect(list.tagName).toBe('OL');

  const items = within(list).getAllByRole('listitem');
  expect(items).toHaveLength(DISCLOSURES.length);
  items.forEach((item, index) => {
    const disclosure = DISCLOSURES[index];
    expect(within(item).getByRole('heading', { level: 3, name: disclosure.title }))
      .toBeInTheDocument();
    expect(within(item).getByText(disclosure.body, { selector: 'p' }))
      .toBeInTheDocument();
  });
}

beforeEach(() => {
  mockedDemoAccessCheck.mockReset();
  mockedHiringExplanationRequest.mockReset();
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  document.querySelector('[data-test-text-spacing-override]')?.remove();
});

describe('input-to-results accessibility contract', () => {
  it('presents AI Scenario Review above complementary Q&A without sending on render or disclosure expansion', async () => {
    const page = mount();
    fireEvent.click(screen.getByTestId('load-northstar'));
    page.results();
    const review = screen.getByRole('region', { name: 'AI Scenario Review' });
    expect(review).toBeVisible();
    expect(review.closest('details')).toBeNull();
    expect(within(review).getByText('Powered by Meta · Muse Spark 1.3 Standard')).toBeVisible();
    expect(within(review).getByRole('button', { name: 'Generate AI review' })).toBeVisible();
    expect(within(review).getByRole('button', { name: 'Generate AI review' })).toBeDisabled();
    const followUp = screen.getByTestId('card-ask-link');
    expect(review.compareDocumentPosition(followUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(followUp).getByText(/Have a follow-up question/)).toBeVisible();
    await userEvent.click(within(review).getByText('Exactly what is sent'));
    expect(mockedDemoAccessCheck).not.toHaveBeenCalled();
    expect(mockedHiringExplanationRequest).not.toHaveBeenCalled();
    expect(screen.queryByText(/One-time sample explanation|earlier Meta feature/)).not.toBeInTheDocument();
  });
  it('gives every visible financial input a label, units, hint and unknown/zero state', () => {
    mount();
    for (const profile of ['load-northstar', 'load-juniper']) {
      fireEvent.click(screen.getByTestId(profile));
      for (const input of screen.getAllByRole('spinbutton')) {
        expect(input).toHaveAccessibleName();
        const ids = input.getAttribute('aria-describedby')!.split(' ');
        expect(ids.length).toBeGreaterThanOrEqual(3);
        for (const id of ids) expect(document.getElementById(id)).toHaveTextContent(/\S/);
        expect(input).toHaveAccessibleDescription(/US dollars(?: per (?:month|year|hour))?\.|Hours per week\.|Month number, 1 through 12\.|Number of months\.|Percent\./);
        expect(input).toHaveAccessibleDescription(/Entered|Explicit zero/);
      }
    }
    expect(screen.getByRole('combobox', { name: 'Worker relationship' })).toHaveAccessibleDescription(/does not determine legal classification/);
    expect(screen.getByRole('combobox', { name: 'Compensation basis' })).toHaveAccessibleDescription(/Active input: hourly rate/);
    expect(screen.getByRole('spinbutton', { name: 'Monthly operating cash flow before this hire' })).toHaveAccessibleDescription(/Existing payroll, operating costs and debt payments belong here/);
  });

  it('communicates numeric bounds and keeps decimal and whole-number controls keyboard reachable', async () => {
    const user = userEvent.setup();
    mount();
    fireEvent.click(screen.getByTestId('load-northstar'));

    const decimal = screen.getByRole('spinbutton', { name: 'Variable costs' });
    expect(decimal).toHaveAttribute('type', 'number');
    expect(decimal).toHaveAttribute('min', '0');
    expect(decimal).toHaveAttribute('max', '100');
    expect(decimal).toHaveAttribute('step', '0.1');
    expect(decimal).toHaveAccessibleDescription(/Allowed range: 0–100/);

    const wholeNumber = screen.getByRole('spinbutton', { name: 'Planned start month' });
    expect(wholeNumber).toHaveAttribute('type', 'number');
    expect(wholeNumber).toHaveAttribute('min', '1');
    expect(wholeNumber).toHaveAttribute('max', '12');
    expect(wholeNumber).toHaveAttribute('step', '1');
    expect(wholeNumber).toHaveAccessibleDescription(/Allowed range: 1–12 \(whole numbers\)/);

    decimal.focus();
    expect(decimal).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(decimal).toHaveFocus();
    wholeNumber.focus();
    expect(wholeNumber).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(wholeNumber).toHaveFocus();

    // These layout classes keep the control full-width on narrow screens and
    // place it in the dedicated column at the sm breakpoint and above.
    expect(decimal).toHaveClass('w-full', 'min-w-0');
    expect(decimal.parentElement).toHaveClass('contrast-input-boundary');
    expect(decimal.parentElement?.parentElement?.parentElement).toHaveClass('grid', 'sm:grid-cols-[1fr_240px]');
  });

  it('withholds projections for values outside the communicated native bounds', () => {
    const app = mount();
    fireEvent.click(screen.getByTestId('load-northstar'));

    const percent = screen.getByTestId('input-variableCostPercent') as HTMLInputElement;
    fireEvent.change(percent, { target: { value: '100.1' } });
    expect(percent.validity.rangeOverflow).toBe(true);
    app.results();
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('Projection withheld');
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('between 0 and 100');
    expect(screen.queryByTestId('ending-cash-hire-now')).not.toBeInTheDocument();

    app.inputs();
    fireEvent.change(screen.getByTestId('input-plannedStartMonth'), { target: { value: '13' } });
    app.results();
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('Projection withheld');
    expect(screen.getByTestId('scenario-hire-now')).toHaveTextContent('whole month from 1 to 12');
    expect(screen.queryByTestId('ending-cash-hire-now')).not.toBeInTheDocument();
  });

  it('lets a keyboard user clear a value without losing focus when the clear button disappears', async () => {
    const user = userEvent.setup();
    mount();
    const cash = screen.getByRole('spinbutton', { name: 'Current business cash' });
    cash.focus();
    await user.type(cash, '0');
    expect(cash).toHaveAccessibleDescription(/Explicit zero/);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Mark Current business cash unknown' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(cash).toHaveFocus();
    expect(cash).toHaveValue(null);
    expect(cash).toHaveAccessibleDescription(/Unknown/);
    await user.tab();
    expect(screen.getByRole('spinbutton', { name: 'Monthly operating cash flow before this hire' })).toHaveFocus();
  });

  it('keeps conditional pay fields labeled and in natural keyboard order', async () => {
    const user = userEvent.setup();
    mount();
    const basis = screen.getByRole('combobox', { name: 'Compensation basis' });
    await user.selectOptions(basis, 'salary');
    expect(screen.queryByRole('spinbutton', { name: 'Hourly rate' })).not.toBeInTheDocument();
    basis.focus();
    await user.tab();
    expect(screen.getByRole('spinbutton', { name: 'Annual salary' })).toHaveFocus();
    await user.selectOptions(basis, 'hourly');
    basis.focus();
    await user.tab();
    expect(screen.getByRole('spinbutton', { name: 'Hourly rate' })).toHaveFocus();
    expect(screen.queryByRole('spinbutton', { name: 'Annual salary' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Worker relationship' }), 'independent-contractor');
    expect(screen.getByRole('spinbutton', { name: 'Additional contractor-engagement costs' })).toHaveAccessibleDescription(/Known business costs tied to this engagement/);
  });

  it('announces missing or invalid projections and exposes exact requirements in named sections', () => {
    const app = mount();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('0 of 3 hire projections calculated');
    fireEvent.click(screen.getByTestId('load-northstar'));
    expect(status).toHaveTextContent('All hire projections are available');
    fireEvent.change(screen.getByTestId('input-reducedAnnualSalary'), { target: { value: '' } });
    expect(status).toHaveTextContent('2 of 3 hire projections calculated');
    app.results();
    expect(screen.getByRole('status', { name: 'Calculation status' })).toHaveTextContent('Missing or invalid inputs are listed');
    const missing = screen.getByTestId('scenario-reduced-hours');
    expect(missing).toHaveAccessibleName();
    expect(within(missing).getByRole('list')).toHaveTextContent('Reduced-hours annual salary');
    expect(within(missing).queryByRole('table')).not.toBeInTheDocument();
    app.inputs();
    fireEvent.change(screen.getByTestId('input-variableCostPercent'), { target: { value: '101' } });
    app.results();
    expect(screen.getByTestId('missing-hire-now')).toHaveTextContent('between 0 and 100');
  });

  it('announces Meta request progress and exposes mocked failure details without retrying', async () => {
    mockedDemoAccessCheck.mockResolvedValue({
      status: 'allowed',
      providerRequestMade: false,
      providerAttemptConsumed: false,
      budget: { total: 5, used: 1, remaining: 4 },
    });
    let rejectExplanation!: (reason: unknown) => void;
    mockedHiringExplanationRequest.mockImplementation(() => new Promise((_, reject) => {
      rejectExplanation = reject;
    }));
    render(
      <InputsProvider>
        <MetaExplanationAccessibilityFixture />
      </InputsProvider>,
    );

    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByTestId('meta-consent'));

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Check demo availability first.');
    expect(mockedDemoAccessCheck).not.toHaveBeenCalled();
    expect(mockedHiringExplanationRequest).not.toHaveBeenCalled();

    const explainButton = screen.getByTestId('button-explain-meta');
    expect(explainButton).toBeDisabled();
    fireEvent.click(explainButton);
    expect(mockedHiringExplanationRequest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    expect(status).toHaveTextContent('Checking demo availability only.');
    expect(mockedDemoAccessCheck).toHaveBeenCalledOnce();
    expect(mockedHiringExplanationRequest).not.toHaveBeenCalled();

    await screen.findByText(/Demo availability confirmed\. No Meta request was made\./);
    expect(status).toHaveTextContent('Demo availability confirmed.');
    expect(explainButton).toBeEnabled();
    expect(mockedHiringExplanationRequest).not.toHaveBeenCalled();

    fireEvent.click(explainButton);
    expect(status).toHaveTextContent('Sending the fictional sample to Meta.');
    expect(explainButton).toBeDisabled();
    expect(mockedHiringExplanationRequest).toHaveBeenCalledOnce();

    await act(async () => {
      rejectExplanation({
        data: {
          code: 'META_HTTP_429',
          message: 'The demo request limit was reached.',
          providerAttemptConsumed: true,
        },
      });
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The demo request limit was reached.');
    expect(alert).toHaveTextContent('META_HTTP_429');
    expect(status).toHaveTextContent('Meta request did not produce a response.');
    expect(mockedDemoAccessCheck).toHaveBeenCalledOnce();
    expect(explainButton).toBeDisabled();
    fireEvent.click(explainButton);
    expect(mockedHiringExplanationRequest).toHaveBeenCalledOnce();
  });

  it('retains comparison headers for screen readers in the narrow-screen card layout', () => {
    const app = mount();
    fireEvent.click(screen.getByTestId('load-northstar'));
    app.results();
    const comparison = screen.getByRole('region', { name: /Side-by-side comparison/ });
    expect(comparison).toHaveAttribute('tabindex', '0');
    const table = within(comparison).getByRole('table');
    expect(table).toHaveAccessibleName(/Cash after 12 months/);
    expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
    expect(table.querySelector('thead')).toHaveClass('sr-only', 'sm:not-sr-only');
    expect(table.querySelector('thead')).not.toHaveClass('hidden');
    expect(within(table).getAllByRole('rowheader')).toHaveLength(4);
    expect(within(screen.getByTestId('compare-row-hire-now')).getAllByRole('cell')).toHaveLength(5);
  });

  it('keeps focus, input boundaries, notices, negative cash and headers distinguishable at higher contrast', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-contrast:\s*more\)/);
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)/);
    expect(css).toContain('outline: 2px solid Highlight');
    expect(css).toContain('border: 1px solid ButtonText');
    expect(css).toContain('background-color: Canvas');
    expect(css).toContain('color: CanvasText');
    expect(css).toContain('text-decoration: underline');
    expect(css).toContain('.comparison-table-header.sr-only');
    expect(css).toContain('min-width: 720px');
    expect(css).toMatch(/\.comparison-table-header\.sr-only\s*\{[^}]*clip-path:\s*none/);

    const app = mount();
    const cashInput = screen.getByRole('spinbutton', { name: 'Current business cash' });
    expect(cashInput.parentElement).toHaveClass('contrast-input-boundary');
    expect(screen.getByRole('combobox', { name: 'Worker relationship' })).toHaveClass('contrast-select');
    expect(screen.getByTestId('synthetic-data-warning')).toHaveClass('contrast-notice');

    fireEvent.click(screen.getByTestId('load-northstar'));
    fireEvent.change(screen.getByTestId('input-monthlyOperatingCashFlow'), { target: { value: '-1000000' } });
    app.results();

    expect(screen.getByTestId('ending-cash-hire-now')).toHaveClass('cash-negative');
    expect(screen.getByTestId('compare-lowest-no-hire')).toHaveClass('cash-negative');
    const comparison = screen.getByRole('region', { name: /Side-by-side comparison/ });
    expect(within(comparison).getByRole('table')).toHaveClass('contrast-table', 'comparison-table');
    expect(within(comparison).getByRole('table').querySelector('thead')).toHaveClass('comparison-table-header');
    expect(screen.getByTestId('synthetic-data-warning')).toHaveClass('contrast-notice');
  });

  it('names each native details control and makes all monthly tables keyboard-focusable regions with scoped headers', () => {
    const app = mount();
    fireEvent.click(screen.getByTestId('load-northstar'));
    app.results();
    for (const id of ['no-hire', 'hire-now', 'reduced-hours', 'delayed-hire']) {
      const details = screen.getByTestId(`monthly-details-${id}`);
      const summary = details.querySelector('summary')!;
      expect(summary).toHaveAccessibleName(/monthly cash table, 12 rows/);
      expect(summary.getAttribute('aria-label')).not.toBe('Monthly cash table, 12 rows');
      // jsdom does not implement native Enter/Space details activation or layout;
      // browser verification covers those, plus arrow-key horizontal scrolling.
      fireEvent.click(summary);
      expect(details).toHaveAttribute('open');
      const region = screen.getByTestId(`projection-scroll-${id}`);
      expect(region).toHaveAttribute('role', 'region');
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region).toHaveAccessibleName(/scroll horizontally/);
      const table = within(region).getByRole('table');
      expect(table).toHaveAccessibleName();
      expect(within(table).getAllByRole('rowheader')).toHaveLength(12);
      for (const header of within(table).getAllByRole('columnheader')) expect(header).toHaveAttribute('scope', 'col');
      fireEvent.click(summary);
      expect(details).not.toHaveAttribute('open');
    }
  });

  it('scrolls comparison and monthly cash tables with the left and right arrow keys', () => {
    const app = mount();
    fireEvent.click(screen.getByTestId('load-northstar'));
    app.results();

    const comparison = screen.getByTestId('hiring-comparison-summary').querySelector('[role="region"]')!;
    const comparisonScroll = vi.fn();
    Object.defineProperty(comparison, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(comparison, 'scrollBy', { configurable: true, value: comparisonScroll });
    expect(fireEvent.keyDown(comparison, { key: 'ArrowRight' })).toBe(false);
    expect(comparisonScroll).toHaveBeenCalledWith({ left: 300, behavior: 'auto' });
    expect(fireEvent.keyDown(comparison, { key: 'ArrowLeft' })).toBe(false);
    expect(comparisonScroll).toHaveBeenLastCalledWith({ left: -300, behavior: 'auto' });
    expect(fireEvent.keyDown(comparison, { key: 'ArrowDown' })).toBe(true);
    expect(comparisonScroll).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('monthly-details-no-hire').querySelector('summary')!);
    const monthly = screen.getByTestId('projection-scroll-no-hire');
    const monthlyScroll = vi.fn();
    Object.defineProperty(monthly, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(monthly, 'scrollBy', { configurable: true, value: monthlyScroll });
    expect(fireEvent.keyDown(monthly, { key: 'ArrowRight' })).toBe(false);
    expect(monthlyScroll).toHaveBeenCalledWith({ left: 300, behavior: 'auto' });
    expect(monthly).toHaveAccessibleName(/left and right arrow keys/);
    expect(screen.getAllByText(/use the left and right arrow keys/).length).toBeGreaterThan(0);
  });
});

describe('overview and disclosure high-contrast support', () => {
  it('exposes the disclosure dialog description and all six heading-copy pairs in order', async () => {
    const user = userEvent.setup();
    render(<Router><InputsProvider><Overview /></InputsProvider></Router>);

    await user.click(screen.getByTestId('button-open-disclosures'));

    const dialog = screen.getByRole('dialog', { name: 'Disclosures' });
    expect(dialog).toHaveAccessibleDescription('Please read these before relying on anything HireSense shows.');

    const list = within(dialog).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);

    items.forEach((item, index) => {
      const disclosure = DISCLOSURES[index];
      expect(within(item).getByRole('heading', { level: 3, name: disclosure.title }))
        .toBeInTheDocument();
      expect(within(item).getByText(disclosure.body, { selector: 'p' }))
        .toBeInTheDocument();
    });
  });
  it('marks overview surfaces and disclosure copy for contrast-safe rendering', async () => {
    const user = userEvent.setup();
    render(<Router><InputsProvider><Overview /></InputsProvider></Router>);

    expect(screen.getByTestId('overview-hero')).toHaveClass('contrast-surface', 'overview-hero');
    expect(screen.getByTestId('card-step-01')).toHaveClass('contrast-surface');

    await user.click(screen.getByTestId('button-open-disclosures'));
    const dialog = screen.getByRole('dialog', { name: 'Disclosures' });
    expect(dialog).toHaveClass('contrast-surface');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(6);
    expect(within(dialog).getAllByRole('listitem')[0]).toHaveClass('contrast-disclosure-item');
    expect(within(dialog).getByText(/Any results HireSense shows will be estimates/)).toHaveClass('contrast-secondary');
  });

  it('keeps disclosures readable with expanded spacing at 400% zoom and both close controls reachable', async () => {
    const user = userEvent.setup();
    render(<Router><InputsProvider><Overview /></InputsProvider></Router>);

    const trigger = screen.getByTestId('button-open-disclosures');
    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('dialog', { name: 'Disclosures' });
    // This includes the 320×480 text-spacing case and the approximately
    // 320×200 CSS-pixel viewport produced by 400% zoom on a 1280×800 desktop.
    // jsdom cannot lay out pixels, so browser geometry and scrolling are checked separately.
    expect(dialog).toHaveClass('min-w-0', 'grid-cols-[minmax(0,1fr)]', 'overflow-y-auto');
    expect(dialog).toHaveClass('w-[calc(100vw-2rem)]');
    expect(dialog).toHaveClass('max-h-[85dvh]', 'overflow-x-hidden');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveClass('sticky', 'top-0');
    const textSpacingOverride = document.createElement('style');
    textSpacingOverride.dataset.testTextSpacingOverride = '';
    textSpacingOverride.textContent = `
      [role="dialog"] * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      [role="dialog"] p { margin-bottom: 2em !important; }
    `;
    document.head.append(textSpacingOverride);
    expect(textSpacingOverride.sheet).not.toBeNull();
    expect(textSpacingOverride.textContent).toContain('letter-spacing: 0.12em');
    expect(textSpacingOverride.textContent).toContain('word-spacing: 0.16em');
    expect(textSpacingOverride.textContent).toContain('margin-bottom: 2em');
    expect(within(dialog).getByRole('heading', { name: 'Disclosures' })).toHaveClass('break-words');
    expect(within(dialog).getByRole('heading', { name: 'Disclosures' }).parentElement).toHaveClass('pr-12');
    expect(within(dialog).getByText('Please read these before relying on anything HireSense shows.')).toHaveClass('contrast-secondary', 'break-words');
    const list = within(dialog).getByRole('list');
    expect(list).toHaveClass('min-w-0');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(within(item).getByRole('heading', { level: 3 })).toHaveClass('break-words');
      const copy = item.querySelector('div.min-w-0 p.break-words');
      expect(copy?.textContent?.trim()).toBeTruthy();
      expect(copy).toHaveClass('break-words');
    }
    expect(within(dialog).getByText(/No automatic requests or retries run/)).toBeInTheDocument();

    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    Object.defineProperty(dialog, 'clientHeight', { configurable: true, value: 408 });
    Object.defineProperty(dialog, 'scrollHeight', { configurable: true, value: 1600 });
    dialog.scrollTop = 600;
    close.focus();
    expect(close).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.keyboard('{Enter}');
    const reopenedDialog = screen.getByRole('dialog', { name: 'Disclosures' });
    Object.defineProperty(reopenedDialog, 'clientHeight', { configurable: true, value: 408 });
    Object.defineProperty(reopenedDialog, 'scrollHeight', { configurable: true, value: 1600 });
    reopenedDialog.scrollTop = reopenedDialog.scrollHeight - reopenedDialog.clientHeight;
    await user.tab();
    const done = within(reopenedDialog).getByRole('button', { name: 'Close disclosures' });
    expect(done.parentElement).toHaveClass('focus-within:sticky', 'focus-within:bottom-0', 'focus-within:z-10', 'focus-within:bg-background');
    expect(done).toHaveClass('max-w-full', 'min-w-0', 'whitespace-normal', 'break-words', '[overflow-wrap:anywhere]');
    expect(done.querySelector('span')).toHaveClass('min-w-0', '[overflow-wrap:anywhere]');
    expect(done).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    textSpacingOverride.remove();
  });

  it('keeps setup disclosure content and supporting text contrast-aware', () => {
    render(<Router><InputsProvider><Setup /></InputsProvider></Router>);
    const disclosureSection = screen.getByRole('heading', { name: 'Disclosures' }).parentElement?.nextElementSibling;
    const disclosureList = within(disclosureSection as HTMLElement).getByRole('list');

    expect(disclosureSection).toHaveClass('contrast-surface');
    expect(screen.getByText(/The original LV8N hiring calculator runs locally/)).toHaveClass('contrast-secondary');
    expect(within(disclosureList).getAllByRole('listitem')[0]).toHaveClass('contrast-disclosure-item');
  });

  it('exposes all six disclosures in order as an ordered list on setup without opening the dialog', () => {
    render(<Router><InputsProvider><Setup /></InputsProvider></Router>);

    const section = screen.getByRole('heading', { level: 2, name: 'Disclosures' }).closest('section');
    expect(section).not.toBeNull();
    expectInlineDisclosures(section as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exposes all six disclosures in order as an ordered list on results without opening the dialog', () => {
    const app = mount();
    app.results();

    const section = screen.getByTestId('section-disclosures');
    expectInlineDisclosures(section);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('provides explicit surface, muted-copy and disclosure-divider rules in both contrast modes', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/@media\s*\(prefers-contrast:\s*more\)[\s\S]*?\.contrast-surface\s*\{[^}]*border:\s*2px solid currentColor/);
    expect(css).toMatch(/@media\s*\(prefers-contrast:\s*more\)[\s\S]*?\.contrast-secondary[\s\S]*?color:\s*hsl\(var\(--foreground\)\)/);
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)[\s\S]*?\.contrast-surface\s*\{[^}]*border:\s*1px solid CanvasText;[^}]*background-color:\s*Canvas;[^}]*color:\s*CanvasText/);
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)[\s\S]*?\.contrast-disclosure-item\s*\{[^}]*border-bottom:\s*1px solid CanvasText/);
  });
});

describe('shell keyboard navigation', () => {
  it('keeps routed page content visible without the entrance animation for reduced-motion users', () => {
    const stylesheet = readFileSync('src/index.css', 'utf8');
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.rise\s*\{[^}]*animation:\s*none/,
    );

    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

    const app = mount(true);
    app.results();

    const main = screen.getByRole('main');
    const page = main.querySelector('.rise');
    expect(main).toHaveFocus();
    expect(page).toBeVisible();
    expect(page).toHaveTextContent('Four paths');
  });

  it('offers the skip link first and focuses new content after a route change', async () => {
    const user = userEvent.setup();
    mount(true);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    fireEvent.click(screen.getByTestId('button-go-scenarios'));
    expect(screen.getByRole('main')).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Four paths');
    expect(screen.getByRole('link', { name: 'Scenarios' })).toHaveAttribute('aria-current', 'page');
  });

  it('supports opening, tabbing, Escape and link activation in compact navigation', async () => {
    const user = userEvent.setup();
    mount(true);
    const menu = screen.getByRole('button', { name: 'Menu' });
    const compact = document.getElementById(menu.getAttribute('aria-controls')!)!;
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(compact).not.toBeVisible();
    // Navigation must be opaque immediately, even during rapid keyboard use.
    expect(compact).not.toHaveClass('rise');
    menu.focus();
    await user.keyboard('{Enter}');
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(within(compact).getByRole('link', { name: 'Overview' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu).toHaveFocus();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    const scenarios = within(compact).getByRole('link', { name: 'Scenarios' });
    scenarios.focus();
    await user.keyboard('{Enter}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('main')).toHaveFocus();
    menu.focus();
    await user.keyboard('{Enter}');
    within(compact).getByRole('link', { name: 'Scenarios' }).focus();
    await user.keyboard('{Enter}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('keeps compact navigation labels accessible and every item reachable by keyboard', async () => {
    const user = userEvent.setup();
    mount(true);

    const skipLink = screen.getByRole('link', { name: 'Skip to main content' });
    expect(skipLink).toHaveClass('focus:max-w-[calc(100vw-1rem)]', 'focus:break-words');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'HireSense by LV8N' })).toBeInTheDocument();
    expect(header).toHaveClass('max-[20rem]:px-3');

    const menu = screen.getByRole('button', { name: 'Menu' });
    menu.focus();
    await user.keyboard('{Enter}');
    const compact = document.getElementById('compact-navigation')!;
    const items = [
      within(compact).getByRole('link', { name: 'Overview' }),
      within(compact).getByRole('link', { name: /^Business inputs/ }),
      within(compact).getByRole('link', { name: 'Scenarios' }),
      within(compact).getByRole('link', { name: 'Ask HireSense' }),
      within(compact).getByRole('link', { name: 'Setup & handoff' }),
      within(compact).getByRole('button', { name: 'Disclosures' }),
    ];

    await user.tab();
    for (const item of items) {
      expect(item).toHaveFocus();
      await user.tab();
    }
  });

  it('keeps desktop navigation and build status readable and reachable at 200% text size', async () => {
    const user = userEvent.setup();
    mount(true);

    const sidebar = document.querySelector('aside')!;
    sidebar.style.fontSize = '200%';
    expect(sidebar).toHaveClass('overflow-y-auto', 'min-w-0');

    const nav = within(sidebar).getByRole('navigation', { name: 'Primary' });
    const items = [
      within(nav).getByRole('link', { name: 'Overview' }),
      within(nav).getByRole('link', { name: /^Business inputs/ }),
      within(nav).getByRole('link', { name: 'Scenarios' }),
      within(nav).getByRole('link', { name: 'Ask HireSense' }),
      within(nav).getByRole('link', { name: 'Setup & handoff' }),
      within(nav).getByRole('button', { name: 'Disclosures' }),
    ];

    expect(items[1].querySelector('span')).toHaveClass('min-w-0', 'break-words');
    expect(within(sidebar).getByText('Session status')).toBeInTheDocument();
    for (const gone of ['Build status', 'HireSense app shell', 'Original LV8N calculator imported, runs locally', 'Original calculator tests pass']) {
      expect(within(sidebar).queryByText(gone)).not.toBeInTheDocument();
    }
    expect(within(sidebar).queryByText(/verification pending|verified/i)).not.toBeInTheDocument();
    expect(within(sidebar).getByText('Q&A availability not checked')).toHaveClass('min-w-0', 'break-words');
    expect(within(sidebar).getByText('No Q&A answer this session')).toBeInTheDocument();
    expect(within(sidebar).getByText('App usage: unknown · provider credits: unknown')).toHaveClass('min-w-0', 'break-words');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus();
    // Tab from the skip link to the brand, then through every sidebar item.
    await user.tab();
    for (const item of items) {
      await user.tab();
      expect(item).toHaveFocus();
    }
  });

  it('keeps compact disclosures open, traps focus in the dialog, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    mount(true);
    const menu = screen.getByRole('button', { name: 'Menu' });
    menu.focus();
    await user.keyboard('{Enter}');
    const compact = document.getElementById('compact-navigation')!;
    const disclosures = within(compact).getByRole('button', { name: 'Disclosures' });
    disclosures.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Disclosures' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(disclosures).toHaveFocus();
    expect(menu).toHaveAttribute('aria-expanded', 'true');
  });
});
