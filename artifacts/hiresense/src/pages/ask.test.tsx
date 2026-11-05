// Mocked fixtures only. No live provider call is made and nothing here verifies a genuine response.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { askHiringQuestion, checkHiringDemoAccess, requestHiringExplanation, type HiringExplanation } from '@workspace/api-client-react';
import { InputsProvider, useInputs } from '@/lib/inputs-store';
import { demoAccessHeaders } from '@/lib/meta-demo-access';
import { SafeMarkdown } from '@/components/safe-markdown';
import Ask from './ask';
import Setup from './setup';
import { MAX_SHARED_DEMO_ATTEMPTS, readBudget, useAsk } from '@/lib/ask-store';
import { MetaExplanationPanel } from '@/components/meta-explanation-panel';

vi.mock('@workspace/api-client-react', () => ({ askHiringQuestion: vi.fn(), checkHiringDemoAccess: vi.fn(), requestHiringExplanation: vi.fn() }));
const ask = vi.mocked(askHiringQuestion);
const access = vi.mocked(checkHiringDemoAccess);
const legacy = vi.mocked(requestHiringExplanation);
const answer = (n: number, extra: Partial<HiringExplanation> = {}): HiringExplanation => ({
  mode: 'live', provider: 'Meta Model API', model: 'muse-spark-1.3', profileId: 'northstar-studio',
  requestedAt: '2026-11-04T00:00:00Z', completedAt: '2026-11-04T00:00:01Z', responseId: `resp_${n}`,
  text: `## Answer ${n}\n\nCash dips **first** because of hiring costs.\n\n- point one\n- point two`, ...extra,
});
const budget = (remaining: number) => ({ total: 5, used: 5 - remaining, remaining });

function Controls() {
  const { loadProfile, setField, inputs } = useInputs();
  const { checkAccess } = useAsk();
  return <>
    <div data-testid="calculator-snapshot">{JSON.stringify(inputs)}</div>
    <button onClick={checkAccess}>Check through store</button>
    <button onClick={() => setField('currentCash', null)}>Remove cash</button>
    <button onClick={() => loadProfile('northstar-studio')}>Load Northstar</button>
    <button onClick={() => loadProfile('juniper-kitchen')}>Load Juniper</button>
    <button onClick={() => setField('currentCash', 1)}>Edit cash</button>
  </>;
}
function mount() {
  const loc = memoryLocation({ path: '/ask' });
  render(<Router hook={loc.hook}><InputsProvider><Controls />
    <Route path="/ask"><Ask /></Route>
    <Route path="/other"><p>Other view</p></Route>
    <Route path="/legacy"><MetaExplanationPanel /></Route>
    <Route path="/setup"><Setup /></Route>
  </InputsProvider></Router>);
  return { go: (p: string) => act(() => loc.navigate(p)) };
}
async function ready() {
  fireEvent.click(screen.getByText('Load Northstar'));
  fireEvent.click(screen.getByTestId('button-ask-check'));
  await waitFor(() => expect(screen.getByTestId('ask-status')).toHaveTextContent('Demo availability confirmed'));
  fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
}
const type = (v: string) => fireEvent.change(screen.getByTestId('input-ask-question'), { target: { value: v } });

beforeEach(() => {
  ask.mockReset();
  legacy.mockReset();
  access.mockReset().mockResolvedValue({ status: 'allowed', providerRequestMade: false, providerAttemptConsumed: false, budget: budget(4), model: 'muse-spark-1.3' });
});

describe('Ask HireSense (mocked)', () => {
  it('directs incomplete inputs to samples and blocks checks without modifying calculator data', () => {
    mount();
    const snapshot = screen.getByTestId('calculator-snapshot').textContent;
    expect(screen.getByTestId('ask-ineligible')).toHaveTextContent('Northstar Studio Services');
    expect(screen.getByTestId('ask-ineligible')).toHaveTextContent('Juniper Table Kitchen');
    expect(screen.getByTestId('link-ask-inputs')).toHaveAttribute('href', '/inputs');
    expect(screen.getByTestId('button-ask-check')).toBeDisabled();
    expect(screen.getByTestId('button-ask-check')).toHaveAccessibleDescription(/until you load Northstar/);
    expect(screen.getByTestId('checkbox-ask-consent')).toBeDisabled();
    fireEvent.click(screen.getByTestId('button-ask-check'));
    fireEvent.click(screen.getByText('Check through store'));
    expect(access).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByTestId('ask-quota-unknown')).toBeInTheDocument();
    expect(screen.getByTestId('calculator-snapshot').textContent).toBe(snapshot);
  });

  it.each(['Load Northstar', 'Load Juniper'])('allows %s and valid custom edits but gates missing figures without resetting usage', async (sample) => {
    mount();
    fireEvent.click(screen.getByText(sample));
    const snapshot = screen.getByTestId('calculator-snapshot').textContent;
    expect(screen.getByTestId('button-ask-check')).toBeEnabled();
    expect(screen.getByTestId('checkbox-ask-consent')).toBeEnabled();
    expect(access).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('4'));
    expect(screen.getByTestId('calculator-snapshot').textContent).toBe(snapshot);
    fireEvent.click(screen.getByText('Edit cash'));
    expect(screen.getByTestId('button-ask-check')).toBeEnabled();
    expect(screen.getByTestId('checkbox-ask-consent')).toBeEnabled();
    fireEvent.click(screen.getByText('Remove cash'));
    const incomplete = screen.getByTestId('calculator-snapshot').textContent;
    expect(screen.getByTestId('button-ask-check')).toBeDisabled();
    expect(screen.getByTestId('checkbox-ask-consent')).toBeDisabled();
    fireEvent.click(screen.getByText('Check through store'));
    expect(access).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('4');
    expect(screen.getByTestId('calculator-snapshot').textContent).toBe(incomplete);
  });

  it('keeps code-free guidance visible and describes the non-paid check without submitting a question', async () => {
    const r = mount();
    const help = screen.getByTestId('ask-access-help');
    expect(help).toBeVisible();
    expect(help).toHaveTextContent('No demo code is needed to check availability or ask questions in this development Preview.');
    expect(help).toHaveTextContent('The former demo code was separate from the provider API key.');
    expect(help).toHaveTextContent('That key stays on the server; never enter it here.');
    const check = screen.getByTestId('button-ask-check');
    expect(check).toHaveAccessibleDescription(/No demo code is needed.*never sends your question, contacts Meta or uses a paid attempt.*Only Send question/s);
    expect(document.getElementById('ask-check-help')).toBeVisible();
    expect(access).not.toHaveBeenCalled();
    await ready();
    expect(help).toBeVisible();
    expect(access).toHaveBeenCalledOnce();
    expect(ask).not.toHaveBeenCalled();
    r.go('/setup');
    const setup = screen.getByTestId('status-meta');
    expect(setup).toBeVisible();
    expect(setup).toHaveTextContent('No demo code is needed to check availability or ask questions in this development Preview.');
    expect(setup).toHaveTextContent('provider API key, which stays on the server and must never be entered in the browser');
    expect(setup).toHaveTextContent('Checking availability never sends your question, contacts Meta or uses a paid attempt.');
    expect(ask).not.toHaveBeenCalled();
  });

  it('gates sending on profile, manual availability check, consent and a valid question; prompts only fill', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mount();
    expect(screen.getByTestId('ask-ineligible')).toBeInTheDocument();
    expect(screen.getByTestId('ask-quota-unknown')).toBeInTheDocument();
    const send = screen.getByTestId('button-ask-send');
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByTestId('button-prompt-0'));
    expect(screen.getByTestId('input-ask-question')).toHaveValue('Why does cash fall at first?');
    expect(send).toBeDisabled();
    expect(access).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('4'));
    expect(access.mock.calls[0][0]?.headers).toEqual(demoAccessHeaders());
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
    expect(send).toBeEnabled();
    type('   ');
    expect(send).toBeDisabled();
    type('x'.repeat(600));
    expect(screen.getByTestId('input-ask-question')).toHaveValue('x'.repeat(500));
    expect(ask).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consent remains required in the code-free demo without automatically submitting', async () => {
    mount(); await ready(); type('Q');
    expect(screen.getByTestId('button-ask-send')).toBeEnabled();
    fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });

  it('does not require a passcode after the manual availability check', async () => {
    mount(); fireEvent.click(screen.getByText('Load Northstar'));
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
    type('Q');
    const sendButton = screen.getByTestId('button-ask-send');
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('aria-describedby', expect.stringContaining('ask-blocker'));
    expect(screen.getByTestId('ask-blocker')).toHaveTextContent('Tap Check availability and quota');
    expect(screen.getByTestId('ask-blocker')).toHaveTextContent('does not send your question or use a paid attempt');
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('ask-status')).toHaveTextContent('Demo availability confirmed'));
    expect(sendButton).toBeEnabled();
    expect(access.mock.calls[0][0]?.headers).toEqual(demoAccessHeaders());
  });

  it('sends question with at most the last two turns, keeps five visible, survives view switching', async () => {
    const r = mount(); await ready();
    for (let i = 1; i <= 6; i++) {
      ask.mockResolvedValueOnce({ ...answer(i), budget: budget(Math.max(4 - i, 1)) });
      type(`Question ${i}`);
      fireEvent.click(screen.getByTestId('button-ask-send'));
      await waitFor(() => expect(screen.getByTestId(`ask-turn-${i}`)).toBeInTheDocument());
    }
    const last = ask.mock.calls[5][0];
    expect(last).toEqual({ profileId: 'northstar-studio', consent: true, question: 'Question 6', history: [
      { question: 'Question 4', answer: answer(4).text }, { question: 'Question 5', answer: answer(5).text }] });
    expect(ask.mock.calls[0][0].history).toEqual([]);
    expect(screen.queryByTestId('ask-turn-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('ask-turn-count')).toHaveTextContent('5 of 5');
    type('draft kept');
    r.go('/other'); expect(screen.getByText('Other view')).toBeInTheDocument();
    r.go('/ask');
    expect(screen.getByTestId('ask-turn-6')).toBeInTheDocument();
    expect(screen.getByTestId('input-ask-question')).toHaveValue('draft kept');
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkbox-ask-consent')).toBeChecked();
    expect(access).toHaveBeenCalledOnce();
  });

  it('Clear and profile edits discard history; stale replies are dropped and never shown', async () => {
    mount(); await ready();
    let resolve!: (v: HiringExplanation) => void;
    ask.mockImplementationOnce((_b, o) => new Promise((res) => { resolve = res; o?.signal?.addEventListener('abort', () => {}); }));
    type('Q1'); fireEvent.click(screen.getByTestId('button-ask-send'));
    expect(screen.getByTestId('ask-pending')).toBeInTheDocument();
    const signal = ask.mock.calls[0][1]?.signal as AbortSignal;
    fireEvent.click(screen.getByText('Edit cash'));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(answer(1)));
    expect(screen.queryByTestId('ask-turn-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('ask-sample')).toHaveTextContent('custom');
    expect(screen.getByTestId('checkbox-ask-consent')).not.toBeChecked();
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    expect(screen.getByTestId('ask-quota')).toBeInTheDocument();
    // Reload and answer once, then Clear.
    await ready(); ask.mockResolvedValueOnce({ ...answer(2), budget: budget(2) });
    type('Q2'); fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByText('Q2')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('button-ask-clear'));
    expect(screen.queryByText('Q2')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkbox-ask-consent')).not.toBeChecked();
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('2');
  });

  it.each(['Load Juniper', 'Edit cash'])('clears a populated thread on %s without restoring quota or sending', async action => {
    mount(); await ready();
    ask.mockResolvedValueOnce({ ...answer(1), budget: budget(3) });
    type('Explain the fictional cash timing.');
    fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-turn-1')).toBeInTheDocument());
    fireEvent.click(screen.getByText(action));
    expect(screen.queryByTestId('ask-turn-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    expect(screen.getByTestId('checkbox-ask-consent')).not.toBeChecked();
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('3');
    expect(ask).toHaveBeenCalledOnce();
    expect(access).toHaveBeenCalledOnce();
  });

  it('shows exhaustion from server budget and blocks further sends', async () => {
    mount(); await ready();
    ask.mockResolvedValueOnce({ ...answer(1), budget: budget(0) });
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-exhausted')).toBeInTheDocument());
    type('Another');
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(screen.getByTestId('ask-blocker')).toHaveTextContent('app request cap is used up');
  });

  it('unknown failures require a manual check before another explicit send; never auto-retries', async () => {
    mount(); await ready();
    ask.mockRejectedValueOnce(new Error('network'));
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    expect(screen.getByRole('status')).toHaveTextContent('Sending your question to Meta');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('unknown'));
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(ask).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('button-ask-send')).toBeEnabled());
    expect(ask).toHaveBeenCalledOnce();
  });

  it('applies budget from structured errors and reports consumed attempts', async () => {
    mount(); await ready();
    ask.mockRejectedValueOnce({ data: { code: 'provider_error', message: 'Provider failed.', providerAttemptConsumed: true, budget: budget(1) } });
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-error-consumed')).toHaveTextContent('used a paid slot'));
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('1');
  });

  it('rejects mismatched replies rather than showing them as genuine', async () => {
    mount(); await ready();
    ask.mockResolvedValueOnce(answer(1, { model: 'other' as never }));
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-error')).toBeInTheDocument());
    expect(screen.queryByTestId('ask-turn-1')).not.toBeInTheDocument();
  });

  it('labels controls accessibly and announces status', () => {
    mount();
    expect(screen.getByLabelText('Your question')).toBe(screen.getByTestId('input-ask-question'));
    expect(screen.queryByLabelText(/Demo access code/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-ask-code')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/I agree to send my typed question/)).toBe(screen.getByTestId('checkbox-ask-consent'));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByRole('group', { name: /Example questions/ })).toBeInTheDocument();
  });

  it('renders answer content with a navigable heading, list, and response-details disclosure', async () => {
    mount(); await ready();
    ask.mockResolvedValueOnce({ ...answer(1), budget: budget(3) });
    type('Why does cash dip?');
    fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-turn-1')).toBeInTheDocument());

    const turn = screen.getByTestId('ask-turn-1');
    expect(within(turn).getByRole('heading', { name: 'Answer 1', level: 3 })).toBeInTheDocument();
    expect(within(turn).getByRole('list')).toHaveTextContent('point onepoint two');
    const detailsSummary = within(turn).getByText('Response details');
    expect(detailsSummary.tagName).toBe('SUMMARY');
    const details = detailsSummary.closest('details');
    expect(details).toBeInTheDocument();
    fireEvent.click(detailsSummary);
    expect(details).toHaveAttribute('open');
  });
});

describe('shared quota with the legacy explanation (mocked)', () => {
  it('marks quota stale after an attempt without budget metadata, never pretending a refill', async () => {
    mount(); await ready();
    ask.mockRejectedValueOnce({ data: { code: 'provider_error', message: 'Failed.', providerAttemptConsumed: true } });
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-quota-freshness')).toHaveTextContent('may have changed'));
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('4');
    expect(access).toHaveBeenCalledOnce();
  });

  it('updates shared quota from a legacy explanation reply and requires a check after an unknown legacy outcome', async () => {
    const r = mount(); await ready();
    r.go('/legacy');
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    legacy.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(screen.getByTestId('button-explain-meta'));
    await waitFor(() => expect(screen.getByTestId('meta-error')).toBeInTheDocument());
    r.go('/ask');
    expect(screen.getByTestId('ask-blocker')).toHaveTextContent('outcome is unknown');
    expect(screen.getByTestId('ask-quota-freshness')).toHaveTextContent('may have changed');
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(ask).not.toHaveBeenCalled();
  });

  it('legacy reply budget becomes the shared last-reported quota', async () => {
    const r = mount(); await ready();
    r.go('/legacy');
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    legacy.mockResolvedValueOnce({ ...answer(9), budget: budget(3) });
    fireEvent.click(screen.getByTestId('button-explain-meta'));
    await waitFor(() => expect(screen.getByTestId('meta-live-response')).toBeInTheDocument());
    r.go('/ask');
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('3');
    expect(screen.getByTestId('ask-quota-freshness')).toHaveTextContent('As last reported');
  });
});

describe('quota integrity (mocked)', () => {
  it('readBudget accepts only consistent integer budgets', () => {
    expect(readBudget({ total: 5, used: 1, remaining: 4 })).toEqual({ total: 5, used: 1, remaining: 4 });
    expect(readBudget({ total: 5, used: 7, remaining: 0 })).toEqual({ total: 5, used: 7, remaining: 0 });
    for (const bad of [null, {}, { total: 0, used: 0, remaining: 0 }, { total: 21, used: 0, remaining: 21 },
      { total: 5, used: -1, remaining: 6 }, { total: 5, used: 1, remaining: 3 }, { total: 5, used: 1.5, remaining: 3.5 },
      { total: '5', used: 1, remaining: 4 }]) expect(readBudget(bad)).toBeNull();
    expect(readBudget({ total: MAX_SHARED_DEMO_ATTEMPTS, used: 1, remaining: 19 }))
      .toEqual({ total: 20, used: 1, remaining: 19 });
  });

  it.each([undefined, { total: 5, used: 1, remaining: 9 }])('missing or invalid access budget keeps sending off and asks for a manual check (%o)', async (b) => {
    access.mockResolvedValueOnce({ status: 'allowed', providerRequestMade: false, providerAttemptConsumed: false, budget: b as never });
    mount();
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByTestId('button-ask-check'));
    await waitFor(() => expect(screen.getByTestId('ask-error')).toHaveTextContent('quota could not be read'));
    fireEvent.click(screen.getByTestId('checkbox-ask-consent'));
    type('Q');
    expect(screen.getByTestId('button-ask-send')).toBeDisabled();
    expect(screen.getByTestId('ask-quota-unknown')).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
  });

  it('Clear during an in-flight question keeps the count but marks it stale and requires a new check', async () => {
    mount(); await ready();
    ask.mockImplementationOnce(() => new Promise(() => {}));
    type('Q'); fireEvent.click(screen.getByTestId('button-ask-send'));
    expect(screen.getByTestId('ask-pending')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-ask-clear'));
    expect(screen.getByTestId('ask-quota-remaining')).toHaveTextContent('4');
    expect(screen.getByTestId('ask-quota-freshness')).toHaveTextContent('may have changed');
    await ready(); // explicit manual check refreshes it
    expect(screen.getByTestId('ask-quota-freshness')).toHaveTextContent('As last reported');
    expect(access).toHaveBeenCalledTimes(2);
  });
});

describe('SafeMarkdown', () => {
  it('renders headings, paragraphs and bullets as nodes with no markers', () => {
    render(<SafeMarkdown testId="md" text={'## Title\n\nSome **bold** and *it*.\n\n- a\n- b\n1. c'} />);
    const md = screen.getByTestId('md');
    expect(within(md).getByText('Title').tagName).toBe('H3');
    expect(within(md).getByText('bold').tagName).toBe('STRONG');
    expect(md.querySelectorAll('ul li')).toHaveLength(2);
    expect(md.querySelectorAll('ol li')).toHaveLength(1);
    expect(md.textContent).not.toMatch(/[#*]/);
  });
  it('never renders raw HTML or links', () => {
    render(<SafeMarkdown testId="md" text={'<img src=x onerror="alert(1)"><script>alert(2)</script> [click](javascript:alert(3))'} />);
    const md = screen.getByTestId('md');
    expect(md.querySelector('img,script,a,iframe')).toBeNull();
    expect(md.textContent).toContain('click');
    expect(md.textContent).not.toContain('javascript');
  });
});
