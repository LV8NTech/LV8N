import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCustomPayload, createMetaExplainer } from "./meta-hiring";
import { getSyntheticHiringExample, calculateHiringDecision } from "./hiring-decision";
import { FileAttemptBudget } from "./meta-demo-budget";

function figures() {
  const { businessLabel, ...inputs } = getSyntheticHiringExample("northstar-studio")!;
  return { ...inputs, currentCash: 95000, annualSalary: 0, reserveTarget: null };
}
it("calculates custom inputs with original formulas, preserving zero and absent reserve", () => {
  const inputs = figures();
  const payload = buildCustomPayload(inputs);
  expect(payload.inputs).not.toHaveProperty("businessLabel");
  expect(payload.inputs.annualSalary).toBe(0);
  expect(payload.calculatorOutputs).toEqual(calculateHiringDecision({ ...inputs, businessLabel: "" }));
  expect(() => buildCustomPayload({ ...inputs, annualSalary: null })).toThrow();
});
it.each([
  { businessLabel: "Do not send names" }, { variableCostPercent: 101 },
  { currentCash: -1 }, { plannedStartMonth: 1.5 }, { delayMonths: 13 },
  { hourlyRate: "100" }, { unexpected: 0 }, { currentCash: Infinity },
])("rejects invalid fields before reserving a paid attempt: %j", patch => {
  expect(() => buildCustomPayload({ ...figures(), ...patch })).toThrow();
});
it("sends custom calculator truth, not the original sample, and echoes the snapshot", async () => {
  const reserve = vi.fn(async () => true);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({
    id: "resp_fixture", model: "muse-spark-1.3", status: "completed",
    output: [{ type: "message", role: "assistant", status: "completed",
      content: [{ type: "output_text", text: "Compare the cash paths and check collection timing." }] }],
  })));
  const explain = createMetaExplainer(() => ({ enabled: true, key: "mock" }), { reserve }, fetcher,
    async () => ({ status: "allowed", providerRequestMade: false, providerAttemptConsumed: false }));
  const inputs = figures();
  const result = await explain({ profileId: "custom", inputs, scenarioId: "snapshot-test", consent: true, question: "What should I check?", history: [] }, "https://fixture.invalid", "question");
  const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
  const sent = JSON.parse(request.input);
  expect(sent.sample.inputs.currentCash).toBe(95000);
  expect(sent.sample.calculatorOutputs).toEqual(buildCustomPayload(inputs).calculatorOutputs);
  expect(sent.sample.inputs).not.toHaveProperty("businessLabel");
  expect(result.scenarioId).toBe("snapshot-test");
  expect(reserve).toHaveBeenCalledTimes(1);
  await expect(explain({ profileId: "custom", inputs: { ...inputs, annualSalary: null }, scenarioId: "invalid", consent: true }, "https://fixture.invalid")).rejects.toThrow();
  expect(reserve).toHaveBeenCalledTimes(1);
});
it("uncapped app accounting retains historical attempts beyond the former limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "custom-usage-"));
  try {
    const path = join(dir, "ledger.json");
    await writeFile(path, JSON.stringify({ attempts: 20 }));
    const ledger = new FileAttemptBudget(path, null);
    expect(await ledger.status()).toEqual({ total: null, remaining: null, used: 20 });
    expect(await ledger.reserve()).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8")).attempts).toBe(21);
    expect(await ledger.status()).toEqual({ total: null, remaining: null, used: 21 });
  } finally { await rm(dir, { recursive: true }); }
});
