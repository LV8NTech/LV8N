// Mocked integration checks only. These never verify a genuine provider response.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { checkHiringDemoAccess, requestHiringExplanation, type HiringExplanation } from '@workspace/api-client-react';
import { InputsProvider, useInputs } from '@/lib/inputs-store';
import { MetaExplanationPanel } from './meta-explanation-panel';
import { demoAccessHeaders } from '@/lib/meta-demo-access';

vi.mock('@workspace/api-client-react', () => ({ requestHiringExplanation: vi.fn(), checkHiringDemoAccess: vi.fn() }));
const request = vi.mocked(requestHiringExplanation);
const access = vi.mocked(checkHiringDemoAccess);
const fake: HiringExplanation = {
  mode: 'live', provider: 'Meta Model API', model: 'muse-spark-1.3',
  profileId: 'northstar-studio', requestedAt: '2026-11-04T00:00:00Z',
  completedAt: '2026-11-04T00:00:01Z', responseId: 'resp_mock',
  text: 'Tradeoffs: consider collection timing. Findings: reserve exposure differs. Questions: how reliable are receipts?',
};
function Controls() {
  const { loadProfile, setField, inputs } = useInputs();
  return <>
    <output data-testid="test-cash">{inputs.currentCash}</output>
    <button onClick={() => loadProfile('northstar-studio')}>Load Northstar</button>
    <button onClick={() => loadProfile('juniper-kitchen')}>Load Juniper</button>
    <button onClick={() => setField('currentCash', 0)}>Edit cash</button>
  </>;
}
function mount() {
  return render(<InputsProvider><Controls /><MetaExplanationPanel /></InputsProvider>);
}
async function prepare(name = 'Northstar') {
  fireEvent.click(screen.getByText(`Load ${name}`));
  fireEvent.click(screen.getByTestId('meta-consent'));
  fireEvent.click(screen.getByTestId('button-check-meta-access'));
  await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
}
beforeEach(() => {
  request.mockReset();
  access.mockReset().mockResolvedValue({ status: 'allowed', providerRequestMade: false, providerAttemptConsumed: false, budget: { total: 5, used: 1, remaining: 4 } });
});

describe('Meta panel — mocked integration only', () => {
  it('requires an explicit availability check, unchanged sample and consent; edits never send requests', async () => {
    mount();
    const button = screen.getByTestId('button-explain-meta');
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByText('Load Northstar'));
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByTestId('meta-consent'));
    expect(button).toBeDisabled();
    expect(access).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(button).toBeEnabled());
    expect(access).toHaveBeenCalledOnce();
    expect(access.mock.calls[0]).toHaveLength(1);
    expect(access.mock.calls[0][0]?.headers).toEqual(demoAccessHeaders());
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByTestId('meta-demo-code')).not.toBeInTheDocument();
  });
  it.each(['Northstar', 'Juniper'])('sends only fixed identifiers and consent for %s', async name => {
    request.mockResolvedValue({ ...fake, profileId: name === 'Northstar' ? 'northstar-studio' : 'juniper-kitchen' });
    mount(); await prepare(name);
    fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-live-response');
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toEqual({ profileId: name === 'Northstar' ? 'northstar-studio' : 'juniper-kitchen', consent: true });
    expect(request.mock.calls[0][1]?.headers).toEqual(demoAccessHeaders());
    expect(screen.getByTestId('meta-live-response')).toHaveTextContent('Muse Spark 1.3 Standard');
    expect(screen.getByTestId('meta-live-response')).toHaveTextContent('calculator figures above are authoritative');
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
  });
  it('blocks edited figures and hides previously returned explanations', async () => {
    request.mockResolvedValue(fake);
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-live-response');
    fireEvent.click(screen.getByText('Edit cash'));
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
    expect(screen.getByTestId('meta-custom-ready')).toBeInTheDocument();
    expect(screen.getByTestId('meta-consent')).not.toBeChecked();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(request).toHaveBeenCalledOnce();
  });
  it('aborts a pending request and discards late replies after a sample change', async () => {
    let resolve!: (r: HiringExplanation) => void;
    request.mockImplementation(() => new Promise(r => { resolve = r; }));
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    expect(screen.getByTestId('meta-status')).toHaveTextContent('Sending');
    const signal = request.mock.calls[0][1]?.signal;
    fireEvent.click(screen.getByText('Load Juniper'));
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve(fake));
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledOnce();
  });
  it.each(['META_KEY_MISSING', 'PREVIEW_DEMO_UNAVAILABLE', 'META_HTTP_401', 'META_HTTP_429', 'META_NETWORK_OR_TIMEOUT'])('shows safe %s failures without automatic retries', async code => {
    request.mockRejectedValue({ data: { code, message: 'Safe server explanation; local calculations still work.', providerAttemptConsumed: !['META_KEY_MISSING', 'DEMO_PROTECTION_MISSING'].includes(code) } });
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    expect(await screen.findByTestId('meta-error')).toHaveTextContent(code);
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
  });
  it.each([
    { ...fake, mode: 'simulated' }, { ...fake, model: 'another-model' },
    { ...fake, provider: 'Other' }, { ...fake, profileId: 'juniper-kitchen' }, { ...fake, text: '' },
  ])('never presents a mismatched or simulated result as genuine', async value => {
    request.mockResolvedValue(value as HiringExplanation);
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-error');
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
  });
  it('clears consent and displayed output on explicit clear', async () => {
    request.mockResolvedValue(fake);
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-live-response');
    fireEvent.click(screen.getByTestId('button-meta-clear'));
    expect(screen.queryByTestId('meta-demo-code')).not.toBeInTheDocument();
    expect(screen.getByTestId('meta-consent')).not.toBeChecked();
    expect(screen.queryByTestId('meta-live-response')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledOnce();
  });
  it('checks availability without a passcode and does not send a Meta request', async () => {
    mount();
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('meta-status')).toHaveTextContent('Demo availability confirmed'));
    expect(access.mock.calls[0][0]?.headers).toEqual(demoAccessHeaders());
    expect(screen.getByTestId('button-check-meta-access')).toBeEnabled();
    expect(request).not.toHaveBeenCalled();
  });

  it('allows manual availability rechecking without refreshing, losing inputs or sending Meta', async () => {
    access.mockRejectedValueOnce({ data: { code: 'DEMO_ORIGIN_DENIED', message: 'Address not accepted.', providerAttemptConsumed: false } });
    mount();
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    expect(await screen.findByTestId('meta-error')).toHaveTextContent('no paid attempt was consumed by this request');
    expect(screen.getByTestId('button-check-meta-access')).toBeEnabled();
    expect(access).toHaveBeenCalledOnce();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    expect(access).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByTestId('test-cash')).toHaveTextContent('180000');
    expect(screen.getByTestId('meta-consent')).toBeChecked();
  });
  it('distinguishes an address rejection and shows only safe address diagnostics', async () => {
    access.mockRejectedValue({ data: { code: 'DEMO_ORIGIN_DENIED', message: 'This Preview address was not accepted.', receivedOrigin: 'https://other.test', allowedOrigin: 'https://hiresense.test', providerAttemptConsumed: false } });
    mount(); fireEvent.click(screen.getByTestId('button-check-meta-access'));
    const error = await screen.findByTestId('meta-error');
    expect(error).toHaveTextContent('DEMO_ORIGIN_DENIED');
    expect(error).toHaveTextContent('Received address: https://other.test');
    expect(error).toHaveTextContent('Allowed address: https://hiresense.test');
    expect(error).not.toHaveTextContent('code did not match');
    expect(request).not.toHaveBeenCalled();
  });
  it('permits rechecking after a pre-provider explanation rejection but never resends it', async () => {
    request.mockRejectedValue({ data: { code: 'DEMO_ORIGIN_DENIED', message: 'This Preview address was not accepted.', providerAttemptConsumed: false } });
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-error');
    expect(screen.getByTestId('button-check-meta-access')).toBeEnabled();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    await waitFor(() => expect(screen.getByTestId('button-explain-meta')).toBeEnabled());
    expect(request).toHaveBeenCalledOnce();
    expect(screen.getByTestId('test-cash')).toHaveTextContent('180000');
  });
  it.each([true, undefined])('never unlocks explanation attempts on paid or unknown outcome: %s', async consumed => {
    request.mockRejectedValue({ data: { code: 'META_NETWORK_OR_TIMEOUT', message: 'No usable response.', providerAttemptConsumed: consumed } });
    mount(); await prepare(); fireEvent.click(screen.getByTestId('button-explain-meta'));
    await screen.findByTestId('meta-error');
    expect(screen.getByTestId('button-check-meta-access')).toBeDisabled();
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(screen.getByTestId('button-check-meta-access')).toBeDisabled();
    expect(request).toHaveBeenCalledOnce();
  });
  it('invalidates approved access on profile edits without automatically checking or sending', async () => {
    mount(); await prepare();
    fireEvent.click(screen.getByText('Edit cash'));
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(access).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
  it('discards a late access reply after switching profiles', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof checkHiringDemoAccess>>) => void;
    access.mockImplementation(() => new Promise(r => { resolve = r; }));
    mount();
    fireEvent.click(screen.getByText('Load Northstar'));
    fireEvent.click(screen.getByTestId('meta-consent'));
    fireEvent.click(screen.getByTestId('button-check-meta-access'));
    const signal = access.mock.calls[0][0]?.signal;
    fireEvent.click(screen.getByText('Load Juniper'));
    expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ status: 'allowed', providerRequestMade: false, providerAttemptConsumed: false }));
    expect(screen.getByTestId('button-explain-meta')).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });
  it('sends only a non-secret UI revision marker, never password or provider credentials', () => {
    const headers = new Headers(demoAccessHeaders());
    expect(headers.get('X-HireSense-UI')).toBe('preview-no-code-v1');
    expect(headers.has('X-HireSense-Demo-Code')).toBe(false);
    expect(headers.has('X-HireSense-Demo-Code-Format')).toBe(false);
    expect(headers.has('Authorization')).toBe(false);
  });
});
