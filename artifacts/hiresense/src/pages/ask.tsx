import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Loader2, MessageSquareText, Send, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHead, Pill } from '@/components/shell';
import { SafeMarkdown } from '@/components/safe-markdown';
import { PreviewDemoNotice } from '@/components/preview-demo-notice';
import { LoadFictionalSample } from '@/components/load-fictional-sample';
import { PROFILES } from '@/lib/inputs-store';
import { budgetExhausted } from '@/lib/custom-inputs';
import { MissingForCustom } from '@/components/missing-for-custom';
import { MAX_SENT_TURNS, MAX_VISIBLE_TURNS, PROMPTS, QUESTION_MAX, useAsk } from '@/lib/ask-store';

function fmtTime(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString();
}

export default function Ask() {
  const a = useAsk();
  const threadEnd = useRef<HTMLDivElement>(null);
  const t = a.target;
  const prof = t.kind === 'sample' ? PROFILES.find((p) => p.id === t.profileId) : undefined;
  const eligible = t.kind !== 'none';
  const busy = a.phase === 'checking' || a.phase === 'sending';
  const sending = a.phase === 'sending';
  const exhausted = budgetExhausted(a.budget);
  const q = a.draft.trim();
  const qOk = q.length >= 1 && q.length <= QUESTION_MAX;
  const canSend = eligible && a.accessApproved && a.consent && !a.needsCheck && !busy && !exhausted && qOk;

  useEffect(() => {
    if (a.turns.length) threadEnd.current?.scrollIntoView?.({ block: 'nearest' });
  }, [a.turns.length]);

  const blocker = !eligible
    ? 'First load Northstar Studio Services or Juniper Table Kitchen, or complete your figures so the baseline and all three hire scenarios calculate.'
    : exhausted ? 'The app request cap is used up. Clearing this page does not restore it.'
    : a.needsCheck ? 'The last outcome is unknown. Check availability manually before asking again.'
    : !a.accessApproved ? 'Tap Check availability and quota in the Availability and consent panel. This check does not send your question or use a paid attempt.'
    : !a.consent ? 'Tick the consent box to enable sending.'
    : !qOk ? `Type a question (1–${QUESTION_MAX} characters).`
    : busy ? 'Waiting for the current request.'
    : 'Ready. Sending counts as one app request, even if it fails.';

  const status = a.phase === 'checking' ? 'Checking demo availability only. This never contacts Meta or uses a paid attempt.'
    : sending ? 'Sending your question to Meta. This can take up to 90 seconds.'
    : a.phase === 'error' ? (a.error?.source === 'access' ? 'Demo availability not confirmed.' : 'The question did not produce an answer.')
    : a.phase === 'allowed' ? (a.turns.length ? 'Answer received. You may ask another question.' : 'Demo availability confirmed for this session. No Meta request was made.')
    : 'Nothing is requested automatically.';

  return (
    <div>
      <PageHead eyebrow="Ask HireSense" title="Ask about your cash paths.">
        Type a question about the calculated cash paths for your own figures or a fictional sample. An AI model reads them and answers in plain language. HireSense does not make the hiring decision; the calculator figures stay authoritative.
      </PageHead>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Pill tone="navy"><Sparkles className="h-3 w-3" /> Powered by Meta Muse · Muse Spark 1.3 Standard</Pill>
        <span className="font-mono text-[11px] text-muted-foreground">model: muse-spark-1.3</span>
        <Button asChild variant="outline" size="sm" className="ml-auto" data-testid="link-ask-back-scenarios">
          <Link href="/scenarios"><ArrowLeft className="h-3.5 w-3.5" /> Back to scenarios</Link>
        </Button>
      </div>

      <aside role="note" data-testid="ask-fictional-warning" className="contrast-notice mb-8 flex gap-3 rounded-xl border border-chart-4/50 bg-chart-4/10 px-4 py-3 text-sm">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-foreground/70" />
        <p>Do not type names or personal details. Your question is sent as written; it is not checked or cleaned for personal or confidential details. Calculator figures are sent only with your consent, without the business name. Answers are AI-generated, can be wrong, and are not financial, legal, tax or hiring advice. This development demo has no sign-in or passcode; anyone with access to its configured Preview can send requests.</p>
      </aside>

      {t.kind === 'none' && (
        <section className="mb-8 rounded-2xl border border-dashed bg-card p-6" data-testid="ask-ineligible">
          <h2 className="font-display text-xl">Questions need complete, valid figures</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Enter your own figures so the no-hire baseline and all three hire scenarios calculate (a reserve target is optional), or load an optional fictional sample. Values the calculator rejects are never sent.
          </p>
          <MissingForCustom reasons={t.reasons} />
          <LoadFictionalSample />
          <Button asChild variant="link" size="sm" className="mt-2" data-testid="link-ask-inputs"><Link href="/inputs">Go to Business inputs</Link></Button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Conversation */}
        <section aria-labelledby="ask-thread-title" className="rounded-2xl border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-5 py-4">
            <h2 id="ask-thread-title" className="font-display text-xl">Conversation</h2>
            <span className="font-mono text-[11px] text-muted-foreground" data-testid="ask-turn-count">{a.turns.length} of {MAX_VISIBLE_TURNS} kept</span>
          </div>
          <div className="flex-1 space-y-6 bg-muted/30 p-5 min-h-[260px]" aria-live="polite" data-testid="ask-thread">
            {a.turns.length === 0 && !a.pendingQuestion && (
              <div className="grid place-items-center py-10 text-center" data-testid="ask-empty">
                <MessageSquareText className="h-8 w-8 text-accent-foreground/60" />
                <p className="mt-3 font-display text-lg">No questions yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">Answers stay on this page only until you clear, change inputs or refresh.</p>
              </div>
            )}
            {a.turns.map((t) => (
              <article key={t.id} className="space-y-3" data-testid={`ask-turn-${t.id}`}>
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                  <p className="sr-only">You asked:</p>
                  <p className="whitespace-pre-wrap break-words" data-testid={`ask-question-${t.id}`}>{t.question}</p>
                </div>
                <div className="max-w-[95%] rounded-2xl rounded-bl-sm border bg-card px-4 py-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Meta answer · Muse Spark 1.3 Standard
                  </p>
                  <SafeMarkdown text={t.answer.text} className="mt-3" testId={`ask-answer-${t.id}`} />
                  <details className="mt-3 text-[11px] text-muted-foreground">
                    <summary className="cursor-pointer">Response details</summary>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
                      <dt>Provider</dt><dd className="break-all">{t.answer.provider}</dd>
                      <dt>Model</dt><dd className="break-all">{t.answer.model}</dd>
                      <dt>Profile</dt><dd className="break-all">{t.answer.profileId}</dd>
                      <dt>Completed</dt><dd>{fmtTime(t.answer.completedAt)}</dd>
                      <dt>Response id</dt><dd className="break-all" data-testid={`ask-response-id-${t.id}`}>{t.answer.responseId}</dd>
                    </dl>
                  </details>
                </div>
              </article>
            ))}
            {a.pendingQuestion && (
              <div className="space-y-3" data-testid="ask-pending">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/80 px-4 py-3 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap break-words">{a.pendingQuestion}</p>
                </div>
                <div className="space-y-2.5 rounded-2xl border bg-card p-4" aria-hidden>
                  {[88, 72, 80, 55].map((w, i) => <div key={i} className="h-3 rounded bg-border/80 animate-pulse" style={{ width: `${w}%` }} />)}
                </div>
              </div>
            )}
            {a.error && (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="ask-error">
                <p className="font-medium">{a.error.source === 'access' ? 'Demo availability not confirmed' : 'No answer'}</p>
                <p className="mt-1 break-words">{a.error.message}</p>
                {a.error.code && <p className="mt-1 font-mono text-xs text-muted-foreground">code: {a.error.code}</p>}
                {a.error.receivedOrigin && <p className="mt-2 break-all text-xs">Received address: {a.error.receivedOrigin}</p>}
                {a.error.allowedOrigin && <p className="break-all text-xs">Allowed address: {a.error.allowedOrigin}</p>}
                <p className="mt-2 text-xs text-muted-foreground" data-testid="ask-error-consumed">
                  {a.error.providerAttemptConsumed === false
                    ? 'No Meta request was made and no paid attempt was used. Correct the issue, then choose Check availability and quota. Nothing is resent automatically.'
                    : a.error.providerAttemptConsumed === true
                    ? 'This attempt used a paid slot. Nothing is retried automatically. Check availability again before another question.'
                    : 'Whether a paid attempt was used is unknown. Nothing is retried. Choose Check availability and quota to see the current allowance before asking again.'}
                </p>
              </div>
            )}
            <div ref={threadEnd} />
          </div>

          {/* Composer */}
          <div className="border-t p-5 space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Example questions (fill the box only)">
              {PROMPTS.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => a.setDraft(p)}
                  data-testid={`button-prompt-${i}`}
                  className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
            <label htmlFor="ask-question" className="text-sm font-medium">Your question</label>
            <textarea
              id="ask-question"
              rows={3}
              maxLength={QUESTION_MAX}
              value={a.draft}
              disabled={busy}
              onChange={(e) => a.setDraft(e.target.value)}
              aria-describedby="ask-question-help ask-blocker"
              data-testid="input-ask-question"
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id="ask-question-help" className="text-xs text-muted-foreground">
                1–{QUESTION_MAX} characters · <span className="font-mono" data-testid="ask-char-count">{a.draft.length}/{QUESTION_MAX}</span>
              </p>
              <Button onClick={a.send} disabled={!canSend} aria-describedby="ask-question-help ask-blocker" data-testid="button-ask-send">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send question
              </Button>
            </div>
            <p id="ask-blocker" className="text-sm text-muted-foreground" data-testid="ask-blocker">{blocker}</p>
          </div>
        </section>

        {/* Controls */}
        <section aria-labelledby="ask-access-title" className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 space-y-4">
            <h2 id="ask-access-title" className="font-display text-xl">Availability and consent</h2>
            <p className="text-sm text-muted-foreground">Figures: <strong className="text-foreground" data-testid="ask-sample">{prof ? prof.name : t.kind === 'custom' ? 'Your figures (custom)' : 'none eligible'}</strong></p>

            <PreviewDemoNotice />

            <p id="ask-access-help" className="text-sm text-muted-foreground" data-testid="ask-access-help">
              No demo code is needed to check availability or ask questions in this development Preview. The former demo code was separate from the provider API key. That key stays on the server; never enter it here.
            </p>
            {!eligible && (
              <p id="ask-access-sample-help" className="text-sm text-muted-foreground" data-testid="ask-access-sample-help">
                Availability and consent stay off until you load Northstar Studio Services or Juniper Table Kitchen, or complete valid figures in Business inputs. No availability request is made, no paid attempt is used, and this gate does not change your calculator data.
              </p>
            )}
            <Button variant="outline" onClick={a.checkAccess} disabled={busy || !eligible} aria-describedby={`ask-access-help ask-check-help${!eligible ? ' ask-access-sample-help' : ''}`} className="w-full" data-testid="button-ask-check">
              {a.phase === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Check availability and quota
            </Button>
            <p id="ask-check-help" className="text-xs text-muted-foreground">Checking availability only checks access and reads app usage. It never sends your question, contacts Meta or uses a paid attempt. Only Send question submits your question to Meta and uses a paid attempt.</p>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox" checked={a.consent} disabled={busy || !eligible}
                aria-describedby={!eligible ? 'ask-access-sample-help' : undefined}
                onChange={(e) => a.setConsent(e.target.checked)}
                data-testid="checkbox-ask-consent"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--chart-1))]"
              />
              <span>I agree to send my typed question, the most recent {MAX_SENT_TURNS === 2 ? 'two' : MAX_SENT_TURNS} questions and answers from this page, and {t.kind === 'custom' ? 'my calculator figures (without the business name) and their calculated results' : "the server's fictional sample and its calculated results"} to Meta for each question I send.</span>
            </label>

            <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground" data-testid="ask-status">{status}</p>

            <Button variant="outline" onClick={a.clear} className="w-full" data-testid="button-ask-clear">
              <X className="h-3.5 w-3.5" /> Clear conversation
            </Button>
          </div>

          <div className={`rounded-2xl border p-5 ${exhausted ? 'border-destructive/40 bg-destructive/5' : 'bg-card'}`} data-testid="ask-quota">
            <p className="text-xs uppercase tracking-[0.14em] text-accent-foreground font-medium">App usage</p>
            {a.budget ? (
              <>
                <p className="mt-2 font-display text-3xl tabular-nums" data-testid="ask-quota-used">{a.budget.used} <span className="text-base text-muted-foreground">app requests used</span></p>
                {a.budget.total !== null && a.budget.remaining !== null ? (
                  <>
                    <p className="mt-1 text-sm tabular-nums" data-testid="ask-quota-remaining">{a.budget.remaining} of {a.budget.total} left under the app cap</p>
                    <div className="mt-3 flex gap-1" aria-hidden>
                      {Array.from({ length: a.budget.total }).map((_, i) => (
                        <span key={i} className={`h-2 flex-1 rounded-full ${i < a.budget!.total! - a.budget!.remaining! ? 'bg-border' : 'bg-chart-1'}`} />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm" data-testid="ask-quota-nocap">No app total cap is set. This does not mean provider credits are unlimited.</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground" data-testid="ask-quota-freshness">{a.budgetStale ? 'Last reported figure; a request since then may have changed it. Check availability to update.' : 'As last reported by the server.'}</p>
                {exhausted && <p className="mt-3 text-sm font-medium" data-testid="ask-exhausted">The app request cap is used up. No more questions can be sent.</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="ask-quota-unknown">Unknown until you check availability.</p>
            )}
            <p className="mt-2 text-xs" data-testid="ask-provider-credits">Provider credit balance: unknown. HireSense cannot see it, and requests may fail if it runs out.</p>
            <p className="mt-3 text-xs text-muted-foreground">Shared across reviews and questions. Every sent question counts as one request, including failures. Clearing never restores usage.</p>
          </div>

          <details className="rounded-2xl border bg-card text-sm">
            <summary className="cursor-pointer px-5 py-3 font-medium">Exactly what is sent</summary>
            <ul className="list-disc space-y-1.5 px-5 pb-4 pl-9 text-muted-foreground leading-relaxed">
              <li>Your typed question and up to the last {MAX_SENT_TURNS} question-and-answer pairs shown here (no older history) are sent exactly as entered. They are not checked or cleaned, so leave out names and personal details.</li>
              {t.kind === 'custom'
                ? <li data-testid="ask-sent-custom">Also sent: profile "custom", your consent, the calculator fields exactly as entered (blanks as unknown, explicit zeros kept) and a fingerprint of that snapshot. The business name and identifiers are not sent. The server recalculates the results it shares with Meta.</li>
                : <li>Also sent: the sample id and your consent. For an unchanged fictional sample your browser does not send calculator fields; the server adds its own copy and calculated results.</li>}
              <li>Answers are shown on this page only and cleared when any input changes.</li>
              <li>No sign-in or passcode is required in this development Preview. The provider credential stays on the server and is never sent by your browser.</li>
              <li>Up to {MAX_VISIBLE_TURNS} answers stay visible in memory only.</li>
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}
