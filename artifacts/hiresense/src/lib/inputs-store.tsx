import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  calculateHiringDecision,
  emptyHiringDecision,
  getSyntheticHiringExample,
  type HiringDecisionInputs,
  type HiringDecisionResult,
  type HiringInputKey,
} from '@/lib/hiring-decision';
import { AskProvider } from '@/lib/ask-store';

export type ProfileId = 'northstar-studio' | 'juniper-kitchen';

export const PROFILES: { id: ProfileId; name: string; blurb: string }[] = [
  { id: 'northstar-studio', name: 'Northstar Studio Services', blurb: 'Fictional services studio, salaried employee' },
  { id: 'juniper-kitchen', name: 'Juniper Table Kitchen', blurb: 'Fictional kitchen, hourly employee, negative baseline' },
];

export const CONTRACTOR_SALARY_MESSAGE =
  'Fixed-fee contractor terms are not supported by this prototype; salary and contractor fees are not interchangeable';

type Ctx = {
  inputs: HiringDecisionInputs;
  setField: <K extends HiringInputKey>(key: K, value: HiringDecisionInputs[K]) => void;
  loadProfile: (id: string) => void;
  reset: () => void;
  /** Selected built-in fictional profile id, or "" when none. */
  profile: string;
  /** True when a fictional profile is loaded (edits keep it true; see `edited`). */
  isDemo: boolean;
  /** True when the loaded profile has been edited. */
  edited: boolean;
  result: HiringDecisionResult;
};

const InputsContext = createContext<Ctx | null>(null);

/** Memory-only store. Nothing is persisted; a refresh or fresh mount clears it. */
export function InputsProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState<HiringDecisionInputs>({ ...emptyHiringDecision });
  const [profile, setProfile] = useState('');
  const [edited, setEdited] = useState(false);

  const result = useMemo(() => {
    const calculated = calculateHiringDecision(inputs);
    // Mirrors the original screen: salary-basis contractor projections are withheld.
    if (inputs.workerRelationship === 'independent-contractor' && inputs.compensationBasis === 'salary') {
      return {
        ...calculated,
        scenarios: calculated.scenarios.map((s) => ({
          status: 'incomplete' as const,
          scenarioId: s.scenarioId,
          title: s.title,
          missingInputs: [...(s.status === 'incomplete' ? s.missingInputs : []), CONTRACTOR_SALARY_MESSAGE],
        })),
      };
    }
    return calculated;
  }, [inputs]);

  const value: Ctx = {
    inputs,
    profile,
    isDemo: profile !== '',
    edited,
    result,
    setField: (key, v) => {
      setInputs((p) => ({ ...p, [key]: v }));
      setEdited(true);
    },
    loadProfile: (id) => {
      const example = getSyntheticHiringExample(id);
      if (!example) return;
      setInputs(example);
      setProfile(id);
      setEdited(false);
    },
    reset: () => {
      setInputs({ ...emptyHiringDecision });
      setProfile('');
      setEdited(false);
    },
  };
  return <InputsContext.Provider value={value}><AskProvider>{children}</AskProvider></InputsContext.Provider>;
}

export function useInputs() {
  const c = useContext(InputsContext);
  if (!c) throw new Error('useInputs outside provider');
  return c;
}

/** Count of numeric/choice inputs that are not unknown (null). Label excluded. */
export function countProvided(i: HiringDecisionInputs) {
  return (Object.keys(i) as HiringInputKey[]).filter((k) => k !== 'businessLabel' && i[k] !== null).length;
}
export const TOTAL_FIELDS = Object.keys(emptyHiringDecision).length - 1;
