import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, ShieldCheck, Loader2 } from 'lucide-react';
import { checkHiringDemoAccess, requestHiringExplanation, type HiringExplanation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/shell';
import { SafeMarkdown } from '@/components/safe-markdown';
import { useInputs } from '@/lib/inputs-store';
import { budgetExhausted, budgetText, isGenuineFor, requestBody, requestTargetFor } from '@/lib/custom-inputs';
import { demoAccessHeaders, demoErrorMessage } from '@/lib/meta-demo-access';
import { PreviewDemoNotice } from '@/components/preview-demo-notice';
import { LoadFictionalSample } from '@/components/load-fictional-sample';
import { useAskOptional, readBudget } from '@/lib/ask-store';
import { MissingForCustom } from '@/components/missing-for-custom';

const TIMEOUT_MS = 90_000;

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'access-allowed' }
  | { kind: 'loading' }
  | { kind: 'success'; result: HiringExplanation }
  | { kind: 'error'; message: string; code?: string; providerAttemptConsumed?: boolean; receivedOrigin?: string; allowedOrigin?: string; source?: 'access' };

function errorInfo(err: unknown): { message: string; code?: string; providerAttemptConsumed?: boolean; receivedOrigin?: string; allowedOrigin?: string } {
  const data = (err as { data?: Record<string, unknown> } | null)?.data;
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return {
      ...demoErrorMessage(data.code, data.message),
      providerAttemptConsumed: typeof data.providerAttemptConsumed === 'boolean' ? data.providerAttemptConsumed : undefined,
      receivedOrigin: typeof data.receivedOrigin === 'string' ? data.receivedOrigin : undefined,
      allowedOrigin: typeof data.allowedOrigin === 'string' ? data.allowedOrigin : undefined,
    };
  }
  return { message: 'The AI review request failed. No response is shown.' };
}

function fmtTime(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

export function MetaExplanationPanel() {
  const { inputs, profile, edited } = useInputs();
  const shared = useAskOptional();
  const sharedRef = useRef(shared);
  sharedRef.current = shared;

  const target = useMemo(() => requestTargetFor(inputs, profile, edited), [inputs, profile, edited]);
  const eligible = target.kind !== 'none';
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [accessApproved, setAccessApproved] = useState(false);
  const [settled, setSettled] = useState(false);
  const versionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<{ inputs: unknown; profile: string }>({ inputs, profile });
  const resultInputsRef = useRef<unknown>(null);
  snapshotRef.current = { inputs, profile };

  const cancelPending = () => {
    versionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // Any change to the inputs object or profile hides stale output and aborts pending work.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    cancelPending();
    setAccessApproved(false);
    setConsent(false);
    setPhase({ kind: 'idle' });
  }, [inputs, profile]);

  useEffect(() => () => cancelPending(), []);

  const loading = phase.kind === 'loading';
  const checking = phase.kind === 'checking';
  const busy = loading || checking;
  const canRequest = eligible && consent && accessApproved && !busy && !settled && !budgetExhausted(shared?.budget ?? null);

  const checkAccess = async () => {
    if (busy || settled) return;
    cancelPending();
    const version = versionRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    timerRef.current = setTimeout(() => ctrl.abort(), 15_000);
    setAccessApproved(false);
    setPhase({ kind: 'checking' });
    try {
      const result = await checkHiringDemoAccess({
        headers: demoAccessHeaders(),
        signal: ctrl.signal,
      });
      if (version !== versionRef.current) return;
      if (ctrl.signal.aborted || result.status !== 'allowed' || result.providerRequestMade !== false || result.providerAttemptConsumed !== false) {
        throw new Error('Access could not be confirmed');
      }
      const budget = readBudget(result.budget);
      if (!budget) throw new Error('Remaining quota could not be read');
      sharedRef.current?.reportAttempt(budget, false);
      setAccessApproved(true);
      setPhase({ kind: 'access-allowed' });
    } catch (err) {
      if (version !== versionRef.current) return;
      const info = errorInfo(err);
      setPhase({
        kind: 'error', ...info,
        message: info.code ? info.message : 'Demo availability could not be confirmed. No Meta request was made. You may check availability again.',
        source: 'access', providerAttemptConsumed: false,
      });
    } finally {
      if (version === versionRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        abortRef.current = null;
      }
    }
  };

  const run = async () => {
    if (!canRequest || !eligible) return;
    const sent = target as Exclude<typeof target, { kind: 'none' }>;
    cancelPending();
    const version = versionRef.current;
    const snapInputs = inputs;
    const snapProfile = profile;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    timerRef.current = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
    setPhase({ kind: 'loading' });
    const fresh = () =>
      versionRef.current === version &&
      snapshotRef.current.inputs === snapInputs &&
      snapshotRef.current.profile === snapProfile;
    try {
      const res = await requestHiringExplanation(
        requestBody(sent),
        { headers: demoAccessHeaders(), signal: ctrl.signal },
      );
      if (!fresh()) return;
      if (ctrl.signal.aborted) throw new Error('Request aborted');
      sharedRef.current?.reportAttempt(readBudget((res as { budget?: unknown } | null)?.budget), false);
      setSettled(true);
      if (isGenuineFor(res, sent)) {
        resultInputsRef.current = snapInputs;
        setPhase({ kind: 'success', result: res as HiringExplanation });
      }
      else setPhase({ kind: 'error', message: 'The server reply did not match the expected Meta provider, model, mode, profile, or input snapshot, so it is not shown as a genuine response.' });
    } catch (err) {
      if (!fresh()) return;
      const info = timedOut ? { message: 'The request was stopped after 90 seconds. It was not retried.' } : errorInfo(err);
      if (info.providerAttemptConsumed !== false) {
        sharedRef.current?.reportAttempt(readBudget((err as { data?: { budget?: unknown } } | null)?.data?.budget), info.providerAttemptConsumed === undefined);
      }
      setSettled(info.providerAttemptConsumed !== false);
      setAccessApproved(false);
      setPhase(
        { kind: 'error', ...info },
      );
    } finally {
      if (versionRef.current === version) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        abortRef.current = null;
      }
    }
  };

  const clearAll = () => {
    cancelPending();
    setAccessApproved(false);
    setConsent(false);
    setPhase({ kind: 'idle' });
  };

  const statusText = checking
    ? 'Checking demo availability only. This cannot contact Meta or consume a paid attempt.'
    : phase.kind === 'access-allowed'
    ? 'Demo availability confirmed. No Meta request was made. Generate AI review is a separate action requiring consent.'
    : loading
    ? (target.kind === 'custom' ? 'Sending your calculator figures and calculated results to Meta.' : 'Sending the fictional sample to Meta.') + ' This can take up to 90 seconds.'
    : phase.kind === 'success'
      ? 'Genuine Meta response received.'
      : phase.kind === 'error'
        ? 'Meta request did not produce a response.'
        : settled
          ? 'An AI review was already attempted. This page will not send another. The shared server attempt limit still applies.'
          : eligible
            ? 'Check demo availability first. Nothing runs automatically; checking never contacts Meta.'
            : 'Unavailable until the calculator can complete the baseline and all three hire scenarios.';

  return (
    <section className="rounded-2xl border bg-card overflow-hidden md:col-span-2" data-testid="card-meta" aria-labelledby="meta-title">
      <div className="p-5 sm:p-6 border-b flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-accent-foreground font-medium">Optional AI service · explicit request only</p>
          <h2 id="meta-title" className="font-display text-2xl mt-1">AI Scenario Review</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Understand the tradeoffs, risks, and questions to consider across your hiring options.</p>
        </div>
        <Pill tone="navy"><Sparkles className="h-3 w-3" /> Powered by Meta · Muse Spark 1.3 Standard</Pill>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr]">
        <div className="p-5 sm:p-6 space-y-4 lg:border-r">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Separate from the calculated summary above. The calculator figures stay authoritative; an AI explanation can be wrong and does not decide whether a hire is affordable.
          </p>

          {target.kind === 'none' && (
            <div className="rounded-xl border border-dashed bg-muted/50 px-4 py-3 text-sm" data-testid="meta-eligibility">
              <p>An AI review needs a no-hire baseline and all three hire scenarios calculated from your figures (a reserve target is optional). Values the calculator rejects are never sent.</p>
              <MissingForCustom reasons={target.reasons} />
            </div>
          )}
          {target.kind === 'custom' && (
            <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm" data-testid="meta-custom-ready">Your own calculator figures are ready to review. They are sent only if you consent and choose Generate AI review. The business name is never sent.</p>
          )}
          {target.kind === 'sample' && (
            <p className="rounded-xl border bg-muted/50 px-4 py-3 text-sm" data-testid="meta-sample-ready">Unchanged fictional sample loaded. Only its sample id is sent; the server uses its own copy.</p>
          )}
          <LoadFictionalSample />

          <details className="rounded-xl border bg-background/60 text-sm">
            <summary className="cursor-pointer px-4 py-3 font-medium">Exactly what is sent</summary>
            <ul className="px-4 pb-4 list-disc pl-8 space-y-1.5 text-muted-foreground leading-relaxed" data-testid="meta-sent-list">
              {target.kind === 'custom' ? (
                <li>Your browser sends profile "custom", your consent, the {Object.keys(target.inputs).length} calculator fields exactly as entered (numbers and choices; blanks as unknown, explicit zeros kept), and a fingerprint of that snapshot. The business name and any identifiers are not sent.</li>
              ) : (
                <li>For an unchanged fictional sample, your browser sends only the sample id{target.kind === 'sample' ? ` ("${target.profileId}")` : ''} and your consent. The server adds its own copy of that sample.</li>
              )}
              <li>The server recalculates the no-hire baseline and three alternatives (monthly receipts, costs, cash, reserve comparisons) and sends those to Meta with fixed explanatory instructions.</li>
              <li>The AI output is shown here only, in memory, and is cleared when any input changes. No free-form prompt or documents are sent.</li>
              <li>No sign-in or passcode is required in this development Preview. The provider API key stays on the server.</li>
            </ul>
          </details>

          <PreviewDemoNotice />
          <p className="text-sm font-medium" data-testid="meta-quota">
            {budgetText(shared?.budget ?? null)}
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              data-testid="meta-consent"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--chart-1))]"
            />
            <span>{target.kind === 'custom' ? 'I agree to send my calculator figures (without the business name) and their calculated results, as described above, to Meta for an AI review.' : 'I agree to send the fictional sample and its calculated results described above to Meta for an AI review.'}</span>
          </label>

          <p className="text-xs text-muted-foreground">This development Preview has no sign-in or passcode; anyone with access to it can make requests. Checking availability reads app usage only and uses no paid attempt. Availability checks are limited to twenty per fifteen minutes.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={checkAccess} disabled={busy || settled} data-testid="button-check-meta-access">
              {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check availability
            </Button>
            <Button onClick={run} disabled={!canRequest} data-testid="button-explain-meta">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate AI review
            </Button>
            <Button variant="outline" onClick={clearAll} disabled={!consent && phase.kind === 'idle'} data-testid="button-meta-clear">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          <p role="status" aria-live="polite" className="text-xs text-muted-foreground" data-testid="meta-status">{statusText}</p>
        </div>

        <div className="p-5 sm:p-6 bg-muted/30 min-h-[220px]">
          {phase.kind === 'loading' && (
            <div className="space-y-2.5" aria-hidden>
              {[92, 78, 85, 60, 70].map((w, i) => (
                <div key={i} className="h-3 rounded bg-border/80 animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {phase.kind === 'error' && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="meta-error">
              <p className="font-medium">{phase.source === 'access' ? 'Demo availability not confirmed' : 'No Meta response'}</p>
              <p className="mt-1 break-words">{phase.message}</p>
              {phase.code && <p className="mt-1 font-mono text-xs text-muted-foreground">code: {phase.code}</p>}
              {phase.receivedOrigin && <p className="mt-2 break-all text-xs">Received address: {phase.receivedOrigin}</p>}
              {phase.allowedOrigin && <p className="break-all text-xs">Allowed address: {phase.allowedOrigin}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                {phase.providerAttemptConsumed === false
                  ? 'No Meta request was made and no paid attempt was consumed by this request. The availability-check limit still applies. Correct the issue, then manually check availability. Nothing is resent automatically.'
                  : phase.providerAttemptConsumed === true
                  ? 'This request consumed a provider-attempt slot. No automatic retry. Local calculations still work.'
                  : 'Whether a provider attempt was consumed is unknown. No automatic retry; do not resubmit until the outcome is checked.'}
              </p>
            </div>
          )}
          {phase.kind === 'success' && resultInputsRef.current === inputs && (
            <article data-testid="meta-live-response">
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Genuine Meta response — Muse Spark 1.3 Standard
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-muted-foreground">
                <dt>Provider</dt><dd className="break-all">{phase.result.provider}</dd>
                <dt>Model</dt><dd className="break-all">{phase.result.model}</dd>
                <dt>Completed</dt><dd>{fmtTime(phase.result.completedAt)}</dd>
                <dt>Response id</dt><dd className="break-all">{phase.result.responseId}</dd>
              </dl>
              <div className="mt-4 max-h-[480px] overflow-y-auto"><SafeMarkdown text={phase.result.text} testId="meta-response-text" /></div>
              <p className="mt-4 text-xs text-muted-foreground">AI-generated and may contain errors. The calculator figures above are authoritative. This is not an affordability decision or financial advice.</p>
            </article>
          )}
          {(phase.kind === 'idle' || phase.kind === 'checking' || phase.kind === 'access-allowed') && (
            <p className="text-sm text-muted-foreground">No Meta response yet. Nothing is requested automatically.</p>
          )}
        </div>
      </div>
    </section>
  );
}
