// Mocked only. No live provider or API request is made.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { askHiringQuestion, checkHiringDemoAccess, requestHiringExplanation, type HiringExplanation } from '@workspace/api-client-react';
import { InputsProvider, useInputs } from '@/lib/inputs-store';
import { MetaExplanationPanel } from '@/components/meta-explanation-panel';
import Ask from '@/pages/ask';
import { budgetExhausted, budgetText, fingerprint, readBudget, requestTargetFor, sanitizeInputs } from '@/lib/custom-inputs';
import { getSyntheticHiringExample, emptyHiringDecision } from '@/lib/hiring-decision';

vi.mock('@workspace/api-client-react', () => ({ askHiringQuestion: vi.fn(), checkHiringDemoAccess: vi.fn(), requestHiringExplanation: vi.fn() }));
const ask = vi.mocked(askHiringQuestion);
const access = vi.mocked(checkHiringDemoAccess);
const review = vi.mocked(requestHiringExplanation);
const north = () => getSyntheticHiringExample('northstar-studio')!;

const live = (extra: Partial<HiringExplanation> & Record<string, unknown>) => ({
  mode: 'live', provider: 'Meta Model API', model: 'muse-spark-1.3', profileId: 'custom',
  requestedAt: '2026-11-04T00:00:00Z', completedAt: '2026-11-04T00:00:01Z', responseId: 'r1', text: 'Custom **answer**', ...extra,
}) as HiringExplanation;

function Controls() {
  const { loadProfile, setField } = useInputs();
  return <>
    <button onClick={() => loadProfile('northstar-studio')}>Load Northstar</button>
    <button onClick={() => setField('reserveTarget', 0)}>Zero reserve</button>
    <button onClick={() => setField('businessLabel', 'Secret Co')}>Rename</button>
    <button onClick={() => setField('currentCash', 175_000)}>Edit cash</button>
    <button onClick={() => setField('variableCostPercent', 140)}>Bad percent</button>
  </>;
}
function mount(path: string) {
  const loc = memoryLocation({ path });
  render(<Router hook={loc.hook}><InputsProvider><Controls />
    <Route path="/ask"><Ask /></Route><Route path="/review"><MetaExplanationPanel /></Route>
  </InputsProvider></Router>);
}

beforeEach(() => {
  ask.mockReset(); review.mockReset();
  access.mockReset().mockResolvedValue({ status: 'allowed', providerRequestMade: false, providerAttemptConsumed: false, budget: { total: null, used: 7, remaining: null } } as never);
});

describe('custom input targeting', () => {
  it('unchanged samples use id only; edits become custom without businessLabel; explicit zero kept', () => {
    expect(requestTargetFor(north(), 'northstar-studio', false)).toEqual({ kind: 'sample', profileId: 'northstar-studio' });
    const edited = { ...north(), businessLabel: 'Real Name LLC', reserveTarget: 0 };
    const t = requestTargetFor(edited, 'northstar-studio', true);
    expect(t.kind).toBe('custom');
    if (t.kind !== 'custom') return;
    expect(t.inputs).not.toHaveProperty('businessLabel');
    expect(t.inputs.reserveTarget).toBe(0);
    expect(t.scenarioId).toBe(JSON.stringify(t.inputs));
    expect(t.scenarioId).not.toContain('Real Name');
    expect(fingerprint(sanitizeInputs(edited))).toBe(t.scenarioId);
  });
  it('null reserve is allowed; incomplete or out-of-range figures are withheld with reasons', () => {
    expect(requestTargetFor({ ...north(), reserveTarget: null }, '', true).kind).toBe('custom');
    const empty = requestTargetFor(emptyHiringDecision, '', false);
    expect(empty.kind).toBe('none');
    if (empty.kind === 'none') expect(empty.reasons.join(' ')).toMatch(/Current business cash/);
    for (const bad of [{ variableCostPercent: 101 }, { currentCash: 2e12 }, { hourlyRate: -1 }, { revenueStartMonth: 13 }, { delayMonths: 1.5 }]) {
      expect(requestTargetFor({ ...north(), ...bad }, '', true).kind).toBe('none');
    }
    expect(requestTargetFor({ ...north(), monthlyOperatingCashFlow: -500 }, '', true).kind).toBe('custom');
  });
  it('nullable budget is never exhausted and never implies provider credits', () => {
    const b = readBudget({ total: null, used: 3, remaining: null });
    expect(b).toEqual({ total: null, used: 3, remaining: null });
    expect(budgetExhausted(b)).toBe(false);
    expect(budgetText(b)).toMatch(/No app total cap.*Provider credit balance: unknown/);
    expect(readBudget({ total: null, used: 3, remaining: 2 })).toBeNull();
    expect(readBudget({ total: null, used: -1, remaining: null })).toBeNull();
    expect(budgetExhausted(readBudget({ total: 5, used: 5, remaining: 0 }))).toBe(true);
  });
});

describe('custom inputs in both controls (mocked)', () => {
  it('AI review sends custom inputs plus fingerprint and verifies the echoed scenarioId', async () => {
    mount('/review');
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByText('Rename'));
    fireEvent.click(screen.getByText('Zero reserve'));
    expect(screen.getByTestId('meta-custom-ready')).toBeInTheDocument();
    expect(screen.getByTestId('meta-sent-list')).toHaveTextContent('business name');
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    expect(screen.getByTestId('meta-quota')).toHaveTextContent('Provider credit balance: unknown');
    expect(screen.getByTestId('meta-quota')).toHaveTextContent('No app total cap');
    const body0 = () => review.mock.calls[0][0] as unknown as Record<string, unknown>;
    review.mockImplementationOnce(async (b) => live({ scenarioId: (b as unknown as { scenarioId: string }).scenarioId }));
    fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-live-response');
    const body = body0();
    expect(body.profileId).toBe('custom');
    expect(body.inputs).not.toHaveProperty('businessLabel');
    expect((body.inputs as Record<string, unknown>).reserveTarget).toBe(0);
    expect(body.scenarioId).toBe(JSON.stringify(body.inputs));
    expect(JSON.stringify(body)).not.toContain('Secret Co');
    fireEvent.click(screen.getByText('Edit cash'));
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
    expect(screen.getByTestId('meta-consent')).not.toBeChecked();
  });
  it('AI review rejects a reply echoing a different snapshot', async () => {
    mount('/review');
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByText('Edit cash'));
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    review.mockResolvedValueOnce(live({ scenarioId: 'other' }));
    fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-error');
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
  });
  it('invalid values are withheld and explained; nothing is sent', () => {
    mount('/review');
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByText('Bad percent'));
    expect(screen.getByTestId('custom-missing')).toHaveTextContent('between 0 and 100');
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(review).not.toHaveBeenCalled();
  });
  it('Ask sends custom inputs with limited history and clears history on change', async () => {
    mount('/ask');
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByText('Edit cash'));
    expect(screen.getByTestId('ask-sample')).toHaveTextContent('custom');
    expect(screen.getByTestId('ask-sent-custom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('ask-quota-nocap')).toBeInTheDocument());
    expect(screen.getByTestId('ask-provider-credits')).toHaveTextContent('unknown');
    expect(screen.getByTestId('ask-quota-used')).toHaveTextContent('7');
    fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
    ask.mockImplementation(async (b) => live({ scenarioId: (b as unknown as { scenarioId: string }).scenarioId, budget: { total: null, used: 8, remaining: null } }));
    fireEvent.change(screen.getByTestId('input-ask-question'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByTestId('button-ask-send'));
    await screen.findByTestId('ask-turn-1');
    const body = ask.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ profileId: 'custom', consent: true, question: 'Why?', history: [] });
    expect(body.inputs).not.toHaveProperty('businessLabel');
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    fireEvent.change(screen.getByTestId('input-ask-question'), { target: { value: 'More?' } });
    expect(screen.getByTestId('button-ask-send')).toBeEnabled();
    act(() => { fireEvent.click(screen.getByText('Zero reserve')); });
    expect(screen.queryByTestId('ask-turn-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkbox-ask-consent')).not.toBeChecked();
    expect(ask).toHaveBeenCalledOnce();
  });
});
