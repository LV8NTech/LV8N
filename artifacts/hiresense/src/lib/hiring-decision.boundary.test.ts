import { describe, expect, it } from "vitest";
import {
  calculateHiringDecision,
  emptyHiringDecision,
  type HiringDecisionInputs,
  type HiringDecisionResult,
  type HiringScenarioId,
} from "./hiring-decision";

// Independent fixtures: do not alter the imported calculator or sample expectations.
function inputs(overrides: Partial<HiringDecisionInputs> = {}): HiringDecisionInputs {
  return {
    ...emptyHiringDecision,
    workerRelationship: "employee",
    compensationBasis: "hourly",
    currentCash: 12_345.67,
    monthlyOperatingCashFlow: -123.45,
    reserveTarget: 0,
    hourlyRate: 19.37,
    regularHoursPerWeek: 37.5,
    employerCostsMonthly: 83.29,
    oneTimeHiringCosts: 791.13,
    plannedStartMonth: 1,
    delayMonths: 0,
    reducedHoursPerWeek: 11.25,
    reducedHourlyRate: 31.19,
    reducedEmployerCostsMonthly: 17.43,
    reducedOneTimeHiringCosts: 129.57,
    expectedMonthlyRevenue: 3_271.81,
    variableCostPercent: 37.25,
    revenueStartMonth: 1,
    collectionDelayMonths: 0,
    reducedExpectedMonthlyRevenue: 5_023.47,
    reducedVariableCostPercent: 81.75,
    reducedRevenueStartMonth: 2,
    reducedCollectionDelayMonths: 1,
    ...overrides,
  };
}

const ids = ["hire-now", "reduced-hours", "delayed-hire"] as const;

function projection(result: HiringDecisionResult, id: HiringScenarioId) {
  const scenario = result.scenarios.find((item) => item.scenarioId === id)!;
  expect(scenario.status, id).toBe("calculated");
  if (scenario.status !== "calculated") throw new Error(`${id}: ${scenario.missingInputs}`);
  return scenario.projection;
}

function assertWithheld(result: HiringDecisionResult, id: HiringScenarioId, reason: string) {
  const scenario = result.scenarios.find((item) => item.scenarioId === id)!;
  expect(scenario.status, id).toBe("incomplete");
  expect(scenario).not.toHaveProperty("projection");
  if (scenario.status !== "incomplete") throw new Error(`Expected ${id} to be withheld`);
  expect(scenario.missingInputs).toContain(reason);
}

function near(actual: number, expected: number, operationScale = 1) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Number.isFinite(expected)).toBe(true);
  // Allow floating-point noise, not financial rounding (also works at large scales).
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.max(operationScale, Math.abs(actual), Math.abs(expected)) * Number.EPSILON * 64,
  );
}

// Reconcile every component against entered terms, then independently roll cash
// forward. An internally consistent but incorrectly timed ledger must still fail.
function reconcile(source: HiringDecisionInputs, result: HiringDecisionResult) {
  expect(result.baselineMissingInputs).toEqual([]);
  expect(result.baseline).not.toBeNull();
  const baseline = result.baseline!;
  expect(baseline.endingCash).toHaveLength(12);
  let baselineCash = source.currentCash!;
  for (const cash of baseline.endingCash) {
    baselineCash += source.monthlyOperatingCashFlow!;
    near(cash, baselineCash);
  }
  near(baseline.finalEndingCash, baselineCash);
  near(baseline.lowestEndingCash, Math.min(...baseline.endingCash));

  for (const id of ids) {
    const p = projection(result, id);
    const reduced = id === "reduced-hours";
    const shift = id === "delayed-hire" ? source.delayMonths! : 0;
    const start = source.plannedStartMonth! + shift;
    const receiptStart = shift + (reduced
      ? source.reducedRevenueStartMonth! + source.reducedCollectionDelayMonths!
      : source.revenueStartMonth! + source.collectionDelayMonths!);
    const annual = source.compensationBasis === "salary"
      ? (reduced ? source.reducedAnnualSalary! : source.annualSalary!)
      : (reduced ? source.reducedHourlyRate! * source.reducedHoursPerWeek!
        : source.hourlyRate! * source.regularHoursPerWeek!) * 52;
    const revenue = reduced ? source.reducedExpectedMonthlyRevenue! : source.expectedMonthlyRevenue!;
    const percent = reduced ? source.reducedVariableCostPercent! : source.variableCostPercent!;
    const employer = reduced ? source.reducedEmployerCostsMonthly! : source.employerCostsMonthly!;
    const setup = reduced ? source.reducedOneTimeHiringCosts! : source.oneTimeHiringCosts!;
    expect(p.startMonth).toBe(start);
    near(p.annualizedCompensation, annual);
    near(p.monthlyCompensation, annual / 12);
    expect(p.months).toHaveLength(12);
    let cash = source.currentCash!;
    let totalImpact = 0;
    for (let index = 0; index < 12; index++) {
      const month = index + 1;
      const row = p.months[index];
      const receipts = month >= receiptStart ? revenue : 0;
      const variable = receipts * percent / 100;
      const compensation = month >= start ? annual / 12 : 0;
      const costs = month >= start ? employer : 0;
      const oneTime = month === start ? setup : 0;
      const impact = receipts - variable - compensation - costs - oneTime;
      expect(row.month).toBe(month);
      near(row.baselineOperatingCashFlow, source.monthlyOperatingCashFlow!);
      near(row.incrementalRevenueReceipts, receipts);
      near(row.incrementalVariableCosts, variable);
      near(row.compensation, compensation);
      near(row.explicitlyEnteredEmployerCosts, costs);
      near(row.oneTimeHiringCosts, oneTime);
      near(row.incrementalCashImpact, impact);
      cash += source.monthlyOperatingCashFlow! + impact;
      totalImpact += impact;
      near(row.baselineEndingCash, baseline.endingCash[index]);
      near(row.scenarioEndingCash, cash);
      if (source.reserveTarget === null) expect(row.reserveHeadroom).toBeNull();
      else near(row.reserveHeadroom!, cash - source.reserveTarget);
    }
    near(p.finalEndingCash, cash);
    near(p.finalIncrementalCashImpact, cash - baseline.finalEndingCash);
    // Subtracting two large ending balances can lose precision relative to a
    // small net impact; bound that comparison by the operands, not the result.
    near(p.finalIncrementalCashImpact, totalImpact,
      Math.max(Math.abs(cash), Math.abs(baseline.finalEndingCash)));
    near(p.lowestEndingCash, Math.min(...p.months.map((row) => row.scenarioEndingCash)));
    expect(p.monthsBelowZero).toBe(p.months.filter((row) => row.scenarioEndingCash < 0).length);
    expect(p.monthsBelowReserve).toBe(source.reserveTarget === null ? null
      : p.months.filter((row) => row.scenarioEndingCash < source.reserveTarget!).length);
    expect(p.limitations.some((text) => text.includes("Expected receipts begin after month 12")))
      .toBe(receiptStart > 12);
    expect(p.limitations.some((text) => text.includes("The delayed start falls after month 12")))
      .toBe(start > 12);
  }
}

describe("deterministic generated cash boundaries", () => {
  // Cartesian boundary grid: no random seed, wall clock, sample profile or API.
  const cases = [1, 11, 12].flatMap((start) =>
    [0, 1, 12].flatMap((delay) =>
      [0, 1, 12].flatMap((collection) =>
        [0, 37.25, 100].map((percent) => ({
          start, delay, collection, percent,
        })))));

  it.each(cases)(
    "reconciles fractional hourly pay: start=$start delay=$delay collection=$collection costs=$percent%",
    ({ start, delay, collection, percent }) => {
      const source = inputs({
        plannedStartMonth: start,
        delayMonths: delay,
        revenueStartMonth: start,
        collectionDelayMonths: collection,
        variableCostPercent: percent,
        reducedRevenueStartMonth: 13 - start,
        reducedCollectionDelayMonths: 12 - collection,
        reducedVariableCostPercent: 100 - percent,
        reserveTarget: percent === 0 ? null : percent === 100 ? 0 : 10_000,
      });
      reconcile(source, calculateHiringDecision(source));
    },
  );

  const zeroFields = [
    ["employerCostsMonthly", "Monthly employer costs or benefits", ["hire-now", "delayed-hire"]],
    ["oneTimeHiringCosts", "One-time hiring costs", ["hire-now", "delayed-hire"]],
    ["expectedMonthlyRevenue", "Expected monthly incremental revenue", ["hire-now", "delayed-hire"]],
    ["reducedEmployerCostsMonthly", "Reduced-hours monthly employer costs", ["reduced-hours"]],
    ["reducedOneTimeHiringCosts", "Reduced-hours one-time hiring costs", ["reduced-hours"]],
    ["reducedExpectedMonthlyRevenue", "Reduced-hours expected monthly revenue", ["reduced-hours"]],
  ] as const;

  it.each(Array.from({ length: 64 }, (_, mask) => mask))(
    "selectively withholds mixed unknown/zero costs and receipts (mask %i)",
    (mask) => {
      const source = inputs();
      zeroFields.forEach(([key], bit) => { source[key] = mask & (1 << bit) ? null : 0; });
      const result = calculateHiringDecision(source);
      expect(result.baseline).not.toBeNull();
      for (const id of ids) {
        const missing = zeroFields.filter(([, , affected], bit) =>
          (mask & (1 << bit)) && (affected as readonly HiringScenarioId[]).includes(id));
        if (missing.length) {
          for (const [, label] of missing) assertWithheld(result, id, label);
        } else {
          const p = projection(result, id);
          for (const row of p.months) {
            expect(row.incrementalRevenueReceipts).toBe(0);
            expect(row.incrementalVariableCosts).toBe(0);
            expect(row.explicitlyEnteredEmployerCosts).toBe(0);
            expect(row.oneTimeHiringCosts).toBe(0);
          }
        }
      }
    },
  );

  it.each(["currentCash", "monthlyOperatingCashFlow"] as const)(
    "requires unknown baseline %s even when its counterpart is explicit zero",
    (key) => {
      const source = inputs({ currentCash: 0, monthlyOperatingCashFlow: 0, [key]: null });
      const result = calculateHiringDecision(source);
      expect(result.baseline).toBeNull();
      for (const id of ids) assertWithheld(result, id, key === "currentCash"
        ? "Current business cash" : "Monthly operating cash flow before this hire");
      const complete = { ...source, [key]: 0 };
      reconcile(complete, calculateHiringDecision(complete));
    },
  );

  it.each(["salary", "hourly"] as const)(
    "keeps %s reduced assumptions independent in both directions",
    (basis) => {
      const source = inputs({
        compensationBasis: basis, annualSalary: 71_234.57, reducedAnnualSalary: 64_321.91,
      });
      const original = calculateHiringDecision(source);
      reconcile(source, original);
      const changedRegular = inputs({
        ...source,
        annualSalary: 0, hourlyRate: 0, employerCostsMonthly: 0, oneTimeHiringCosts: 0,
        expectedMonthlyRevenue: 0, variableCostPercent: 0,
        revenueStartMonth: 12, collectionDelayMonths: 12, delayMonths: 12,
      });
      const regularResult = calculateHiringDecision(changedRegular);
      expect(projection(regularResult, "reduced-hours")).toEqual(projection(original, "reduced-hours"));
      reconcile(changedRegular, regularResult);
      const changedReduced = inputs({
        ...source,
        reducedAnnualSalary: 0, reducedHourlyRate: 0, reducedHoursPerWeek: 0.25,
        reducedEmployerCostsMonthly: 0, reducedOneTimeHiringCosts: 0,
        reducedExpectedMonthlyRevenue: 0, reducedVariableCostPercent: 0,
        reducedRevenueStartMonth: 12, reducedCollectionDelayMonths: 12,
      });
      const reducedResult = calculateHiringDecision(changedReduced);
      for (const id of ["hire-now", "delayed-hire"] as const) {
        expect(projection(reducedResult, id)).toEqual(projection(original, id));
      }
      reconcile(changedReduced, reducedResult);
      // Missing compensation may not be inferred from the other alternative.
      for (const reduced of [false, true]) {
        const key = basis === "salary"
          ? reduced ? "reducedAnnualSalary" : "annualSalary"
          : reduced ? "reducedHourlyRate" : "hourlyRate";
        const result = calculateHiringDecision({ ...source, [key]: null });
        for (const id of ids) {
          if ((id === "reduced-hours") === reduced) {
            assertWithheld(result, id, basis === "salary"
              ? reduced ? "Reduced-hours annual salary" : "Annual salary"
              : reduced ? "Reduced-hours hourly rate" : "Hourly rate");
          } else expect(projection(result, id)).toEqual(projection(original, id));
        }
      }
    },
  );

  it.each([1e-100, 1e100, 1e300])("reconciles supported finite scale %s without rounding", (scale) => {
    const source = inputs({
      compensationBasis: "salary", currentCash: 20 * scale,
      monthlyOperatingCashFlow: -scale, reserveTarget: 2 * scale,
      annualSalary: 12 * scale, reducedAnnualSalary: 6 * scale,
      expectedMonthlyRevenue: 3 * scale, reducedExpectedMonthlyRevenue: 2 * scale,
      employerCostsMonthly: scale, reducedEmployerCostsMonthly: scale / 2,
      oneTimeHiringCosts: 2 * scale, reducedOneTimeHiringCosts: scale,
    });
    const result = calculateHiringDecision(source);
    reconcile(source, result);
    // Relative checks alone would not catch tiny cash values rounded to zero.
    expect(projection(result, "hire-now").monthlyCompensation / scale).toBeCloseTo(1, 12);
    expect(projection(result, "hire-now").months[0].oneTimeHiringCosts / scale).toBeCloseTo(2, 12);
  });

  const overflowCases: {
    name: string;
    overrides: Partial<HiringDecisionInputs>;
    withheld: readonly HiringScenarioId[];
  }[] = [
    { name: "regular hourly annualization", overrides: { hourlyRate: Number.MAX_VALUE }, withheld: ["hire-now", "delayed-hire"] },
    { name: "reduced hourly annualization", overrides: { reducedHourlyRate: Number.MAX_VALUE }, withheld: ["reduced-hours"] },
    { name: "regular monthly cash accumulation", overrides: { employerCostsMonthly: Number.MAX_VALUE }, withheld: ["hire-now", "delayed-hire"] },
    { name: "reduced monthly cash accumulation", overrides: { reducedEmployerCostsMonthly: Number.MAX_VALUE }, withheld: ["reduced-hours"] },
  ];
  it.each(overflowCases)("withholds only affected scenarios on $name overflow", ({ overrides, withheld }) => {
    const original = calculateHiringDecision(inputs());
    const result = calculateHiringDecision(inputs(overrides));
    expect(result.baseline).toEqual(original.baseline);
    for (const id of ids) {
      if (withheld.includes(id)) assertWithheld(result, id, "Inputs exceed the supported calculation range.");
      else expect(projection(result, id)).toEqual(projection(original, id));
    }
  });

  it.each([Number.MAX_VALUE, -Number.MAX_VALUE])(
    "withholds all projections when finite baseline flow %s overflows",
    (flow) => {
      const result = calculateHiringDecision(inputs({ monthlyOperatingCashFlow: flow }));
      expect(result.baseline).toBeNull();
      for (const id of ids) assertWithheld(result, id, "The 12-month baseline exceeds the supported calculation range");
    },
  );
});
