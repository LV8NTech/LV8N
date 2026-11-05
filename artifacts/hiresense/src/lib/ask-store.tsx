import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { askHiringQuestion, checkHiringDemoAccess, type HiringExplanation } from '@workspace/api-client-react';
import { useInputs } from '@/lib/inputs-store';
import { MAX_SHARED_DEMO_ATTEMPTS, budgetExhausted, isGenuineFor, readBudget, requestBody, requestTargetFor, type AppBudget, type RequestTarget } from '@/lib/custom-inputs';
import { demoAccessHeaders, demoErrorMessage } from '@/lib/meta-demo-access';

export const QUESTION_MAX = 500;
export const MAX_VISIBLE_TURNS = 5;
export const MAX_SENT_TURNS = 2;
export { MAX_SHARED_DEMO_ATTEMPTS, readBudget };
const ANSWER_MAX = 4000;
const TIMEOUT_MS = 90_000;
const ACCESS_TIMEOUT_MS = 15_000;

export const PROMPTS = [
  'Why does cash fall at first?',
  'What are the tradeoffs if I delay hiring?',
  'Which assumptions should I check?',
];

export type AskError = {
  message: string; code?: string; providerAttemptConsumed?: boolean;
  receivedOrigin?: string; allowedOrigin?: string; source: 'access' | 'question';
};

function errorInfo(err: unknown): Omit<AskError, 'source'> & { budget: AppBudget | null } {
  const data = (err as { data?: Record<string, unknown> } | null)?.data;
  if (data && typeof data.message === 'string' && data.message.trim()) {
    return {
      ...demoErrorMessage(data.code, data.message),
      providerAttemptConsumed: typeof data.providerAttemptConsumed === 'boolean' ? data.providerAttemptConsumed : undefined,
      receivedOrigin: typeof data.receivedOrigin === 'string' ? data.receivedOrigin : undefined,
      allowedOrigin: typeof data.allowedOrigin === 'string' ? data.allowedOrigin : undefined,
      budget: readBudget(data.budget),
    };
  }
  return { message: 'The question could not be answered. No response is shown.', budget: null };
}

export type Turn = { id: number; question: string; answer: HiringExplanation };
export type Phase = 'idle' | 'checking' | 'allowed' | 'sending' | 'error';

type AskCtx = {
  target: RequestTarget;
  consent: boolean; setConsent: (v: boolean) => void;
  draft: string; setDraft: (v: string) => void;
  turns: Turn[];
  phase: Phase;
  error: AskError | null;
  accessApproved: boolean;
  /** Last server-reported quota; null until a manual check or attempt reports it. */
  budget: AppBudget | null;
  /** True when an attempt happened after the last reported quota, so it may be out of date. */
  budgetStale: boolean;
  /** Lets the legacy one-time explanation share its outcome without any network call. */
  reportAttempt: (b: AppBudget | null, outcomeUnknown: boolean) => void;
  /** True after an outcome-unknown failure: a manual access check is required. */
  needsCheck: boolean;
  lastValidated: Turn | null;
  pendingQuestion: string | null;
  checkAccess: () => Promise<void>;
  send: () => Promise<void>;
  clear: () => void;
};

const AskContext = createContext<AskCtx | null>(null);

/** Memory-only Q&A session. Never persisted; refresh, input/profile change or Clear discards it. */
export function AskProvider({ children }: { children: ReactNode }) {
  const { inputs, profile, edited } = useInputs();
  const target = useMemo(() => requestTargetFor(inputs, profile, edited), [inputs, profile, edited]);
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<AskError | null>(null);
  const [accessApproved, setAccessApproved] = useState(false);
  const [budget, setBudget] = useState<AppBudget | null>(null);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [budgetStale, setBudgetStale] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const versionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnId = useRef(0);
  const questionInFlight = useRef(false);
  const snapshotRef = useRef({ inputs, profile });
  snapshotRef.current = { inputs, profile };

  const cancelPending = () => {
    // Canceling an in-flight question may still have used a paid attempt server-side.
    if (abortRef.current && questionInFlight.current) setBudgetStale(true);
    questionInFlight.current = false;
    versionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPendingQuestion(null);
  };

  const resetSession = () => {
    cancelPending();
    setConsent(false);
    setDraft('');
    setTurns([]);
    setPhase('idle');
    setError(null);
    setAccessApproved(false);
    setNeedsCheck(false);
    // Budget is server truth and is intentionally kept: clearing never resets paid quota.
  };

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, profile]);

  useEffect(() => () => { versionRef.current += 1; abortRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const busy = phase === 'checking' || phase === 'sending';

  const checkAccess = async () => {
    if (busy || target.kind === 'none') return;
    cancelPending();
    const version = versionRef.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    timerRef.current = setTimeout(() => ctrl.abort(), ACCESS_TIMEOUT_MS);
    setAccessApproved(false);
    setError(null);
    setPhase('checking');
    try {
      const result = await checkHiringDemoAccess({ headers: demoAccessHeaders(), signal: ctrl.signal });
      if (version !== versionRef.current) return;
      if (ctrl.signal.aborted || result.status !== 'allowed' || result.providerRequestMade !== false || result.providerAttemptConsumed !== false) {
        throw new Error('Access could not be confirmed');
      }
      const b = readBudget(result.budget);
      if (!b) {
        setBudgetStale(true);
        setError({ source: 'access', providerAttemptConsumed: false, message: 'Demo availability was confirmed but the remaining quota could not be read, so sending stays off. No Meta request was made. Check availability again manually.' });
        setPhase('error');
        return;
      }
      setBudget(b); setBudgetStale(false);
      setNeedsCheck(false);
      setAccessApproved(true);
      setPhase('allowed');
    } catch (err) {
      if (version !== versionRef.current) return;
      const info = errorInfo(err);
      if (info.budget) setBudget(info.budget);
      setError({
        ...info, source: 'access', providerAttemptConsumed: false,
        message: info.code ? info.message : 'Demo availability could not be confirmed. No Meta request was made. You may check availability again.',
      });
      setPhase('error');
    } finally {
      if (version === versionRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        abortRef.current = null;
      }
    }
  };

  const question = draft.trim();
  const exhausted = budgetExhausted(budget);
  const canSend = target.kind !== 'none' && accessApproved && consent && !needsCheck && !busy && !exhausted &&
    question.length >= 1 && question.length <= QUESTION_MAX;

  const send = async () => {
    if (!canSend) return;
    cancelPending();
    const version = versionRef.current;
    const snap = snapshotRef.current;
    const sent = target as Exclude<typeof target, { kind: 'none' }>;
    const history = turns
      .filter((t) => t.answer.text.length <= ANSWER_MAX && t.question.length <= QUESTION_MAX)
      .slice(-MAX_SENT_TURNS)
      .map((t) => ({ question: t.question, answer: t.answer.text }));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    questionInFlight.current = true;
    let timedOut = false;
    timerRef.current = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT_MS);
    setError(null);
    setPhase('sending');
    setPendingQuestion(question);
    const fresh = () => versionRef.current === version && snapshotRef.current.inputs === snap.inputs && snapshotRef.current.profile === snap.profile;
    try {
      const res = await askHiringQuestion(
        { ...requestBody(sent), question, history },
        { headers: demoAccessHeaders(), signal: ctrl.signal },
      );
      if (!fresh()) return;
      if (ctrl.signal.aborted) throw new Error('Request aborted');
      const b = readBudget((res as { budget?: unknown } | null)?.budget);
      if (b) { setBudget(b); setBudgetStale(false); } else setBudgetStale(true);
      setPendingQuestion(null);
      if (isGenuineFor(res, sent)) {
        turnId.current += 1;
        const turn: Turn = { id: turnId.current, question, answer: res as HiringExplanation };
        setTurns((prev) => [...prev, turn].slice(-MAX_VISIBLE_TURNS));
        setDraft('');
        setPhase('allowed');
      } else {
        setAccessApproved(false);
        setNeedsCheck(true);
        setError({ source: 'question', providerAttemptConsumed: true, message: 'The server reply did not match the expected Meta provider, model, mode, profile, or input snapshot, so it is not shown as a genuine answer.' });
        setPhase('error');
      }
    } catch (err) {
      if (!fresh()) return;
      setPendingQuestion(null);
      const info = timedOut
        ? { message: 'The question was stopped after 90 seconds. It was not retried.', budget: null }
        : errorInfo(err);
      if (info.budget) { setBudget(info.budget); setBudgetStale(false); } else setBudgetStale(true);
      const consumed = 'providerAttemptConsumed' in info ? info.providerAttemptConsumed : undefined;
      setAccessApproved(false);
      setNeedsCheck(consumed === undefined);
      setError({ ...info, source: 'question', providerAttemptConsumed: consumed });
      setPhase('error');
    } finally {
      if (versionRef.current === version) {
        questionInFlight.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        abortRef.current = null;
      }
    }
  };

  const value: AskCtx = {
    target,
    consent, setConsent: (v) => { if (!busy) setConsent(v); },
    draft, setDraft: (v) => { if (!busy) setDraft(v.slice(0, QUESTION_MAX)); },
    turns, phase, error, accessApproved, budget, budgetStale, needsCheck, pendingQuestion,
    reportAttempt: (b, unknown) => {
      if (b) { setBudget(b); setBudgetStale(false); } else setBudgetStale(true);
      if (unknown) { setNeedsCheck(true); setAccessApproved(false); }
    },
    lastValidated: turns.length ? turns[turns.length - 1] : null,
    checkAccess, send, clear: resetSession,
  };
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}

export function useAsk() {
  const c = useContext(AskContext);
  if (!c) throw new Error('useAsk outside provider');
  return c;
}

/** Optional variant for components that may render without the provider. */
export function useAskOptional() {
  return useContext(AskContext);
}
