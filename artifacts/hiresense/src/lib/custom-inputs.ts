import {
  calculateHiringDecision,
  getSyntheticHiringExample,
  type HiringDecisionInputs,
  type HiringInputKey,
} from '@/lib/hiring-decision';

export type SampleProfile = 'northstar-studio' | 'juniper-kitchen';
export type RequestProfile = SampleProfile | 'custom';
const SAMPLES: SampleProfile[] = ['northstar-studio', 'juniper-kitchen'];

/** Calculator fields sent for custom inputs. businessLabel is deliberately excluded. */
export type CustomInputs = Omit<HiringDecisionInputs, 'businessLabel'>;
export const CUSTOM_KEYS = (Object.keys(getSyntheticHiringExample('northstar-studio')!) as HiringInputKey[])
  .filter((k): k is Exclude<HiringInputKey, 'businessLabel'> => k !== 'businessLabel')
  .sort();

/** Budget as reported by the server. total/remaining null = no app-level cap (says nothing about provider credits). */
export type AppBudget = { total: number | null; used: number; remaining: number | null };
export const MAX_SHARED_DEMO_ATTEMPTS = 20;

export function readBudget(v: unknown): AppBudget | null {
  if (!v || typeof v !== 'object') return null;
  const { total, used, remaining } = v as Record<string, unknown>;
  if (!Number.isInteger(used) || (used as number) < 0) return null;
  const u = used as number;
  if (total === null && remaining === null) return { total: null, used: u, remaining: null };
  if (!Number.isInteger(total) || !Number.isInteger(remaining)) return null;
  const t = total as number, r = remaining as number;
  if (t < 1 || t > MAX_SHARED_DEMO_ATTEMPTS || r !== Math.max(0, t - u)) return null;
  return { total: t, used: u, remaining: r };
}

/** Exhausted only when a finite app cap exists and is used up. Null cap never means exhausted. */
export const budgetExhausted = (b: AppBudget | null) => b !== null && b.remaining !== null && b.remaining <= 0;

export function isUnchangedSample(inputs: HiringDecisionInputs, profile: string, edited: boolean): SampleProfile | null {
  if (edited || !SAMPLES.includes(profile as SampleProfile)) return null;
  const canonical = getSyntheticHiringExample(profile);
  if (!canonical) return null;
  const keys = Object.keys(canonical) as HiringInputKey[];
  if (keys.length !== Object.keys(inputs).length) return null;
  return keys.every((k) => Object.is(canonical[k], inputs[k])) ? (profile as SampleProfile) : null;
}

const MAX_MAGNITUDE = 1e12;
const FINGERPRINT_MAX = 4000;
const PERCENT_KEYS: string[] = ['variableCostPercent', 'reducedVariableCostPercent'];
const MONTH_KEYS: string[] = ['plannedStartMonth', 'revenueStartMonth', 'reducedRevenueStartMonth'];
const DELAY_KEYS: string[] = ['delayMonths', 'collectionDelayMonths', 'reducedCollectionDelayMonths'];

export type RequestTarget =
  | { kind: 'sample'; profileId: SampleProfile }
  | { kind: 'custom'; profileId: 'custom'; inputs: CustomInputs; scenarioId: string }
  | { kind: 'none'; reasons: string[] };

/** Strips businessLabel; returns calculator fields in sorted key order. */
export function sanitizeInputs(inputs: HiringDecisionInputs): CustomInputs {
  const out = {} as Record<string, unknown>;
  for (const k of CUSTOM_KEYS) {
    const v = inputs[k];
    out[k] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
  }
  return out as CustomInputs;
}

/** Deterministic fingerprint: JSON of the sanitized snapshot in sorted key order; the server echoes it back. */
export function fingerprint(c: CustomInputs): string {
  return JSON.stringify(c);
}

/**
 * Picks what may be sent. An unchanged original sample uses its id only.
 * Anything else is custom and must pass the current calculator: baseline plus
 * all three hire scenarios calculated. Invalid values are withheld and explained.
 */
export function requestTargetFor(inputs: HiringDecisionInputs, profile: string, edited: boolean): RequestTarget {
  const sample = isUnchangedSample(inputs, profile, edited);
  if (sample) return { kind: 'sample', profileId: sample };
  const res = calculateHiringDecision(inputs);
  const reasons: string[] = [];
  if (!res.baseline) reasons.push(...res.baselineMissingInputs.map((m) => `No-hire baseline: ${m}`));
  for (const s of res.scenarios) {
    if (s.status !== 'calculated') for (const m of s.missingInputs) reasons.push(`${s.title}: ${m}`);
  }
  if (inputs.workerRelationship === 'independent-contractor' && inputs.compensationBasis === 'salary') {
    reasons.push('Salaried contractor terms are not supported by the calculator.');
  }
  for (const k of CUSTOM_KEYS) {
    const v = inputs[k];
    if (typeof v !== 'number') continue;
    if (!Number.isFinite(v) || Math.abs(v) > MAX_MAGNITUDE) reasons.push(`${k}: must be a finite number no larger than 1,000,000,000,000 in size`);
    else if (v < 0 && k !== 'monthlyOperatingCashFlow') reasons.push(`${k}: cannot be negative`);
    else if (PERCENT_KEYS.includes(k) && v > 100) reasons.push(`${k}: must be between 0 and 100`);
    else if (MONTH_KEYS.includes(k) && (!Number.isInteger(v) || v < 1 || v > 12)) reasons.push(`${k}: must be a whole month from 1 to 12`);
    else if (DELAY_KEYS.includes(k) && (!Number.isInteger(v) || v > 12)) reasons.push(`${k}: must be a whole number from 0 to 12`);
  }
  if (reasons.length) return { kind: 'none', reasons: Array.from(new Set(reasons)) };
  const clean = sanitizeInputs(inputs);
  if (fingerprint(clean).length > FINGERPRINT_MAX) return { kind: 'none', reasons: ['The input snapshot is too large to send.'] };
  return { kind: 'custom', profileId: 'custom', inputs: clean, scenarioId: fingerprint(clean) };
}

/** Request body for the upcoming contract; custom inputs are never paired with a sample id. */
export function requestBody(t: Exclude<RequestTarget, { kind: 'none' }>) {
  return t.kind === 'custom'
    ? { profileId: 'custom' as const, consent: true as const, inputs: t.inputs, scenarioId: t.scenarioId }
    : { profileId: t.profileId, consent: true as const };
}

export function isGenuineFor(r: unknown, t: Exclude<RequestTarget, { kind: 'none' }>): boolean {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return x.mode === 'live' && x.provider === 'Meta Model API' && x.model === 'muse-spark-1.3' &&
    x.profileId === t.profileId && (t.kind !== 'custom' || x.scenarioId === t.scenarioId) &&
    nonEmpty(x.requestedAt) && nonEmpty(x.completedAt) && nonEmpty(x.responseId) && nonEmpty(x.text);
}

export function budgetText(b: AppBudget | null): string {
  if (!b) return 'App usage unknown until availability is checked. Provider credit balance: unknown.';
  const app = b.total === null
    ? `App requests used: ${b.used}. No app total cap is set.`
    : `App requests used: ${b.used}; ${b.remaining} of ${b.total} remaining (last reported).`;
  return `${app} Provider credit balance: unknown.`;
}
