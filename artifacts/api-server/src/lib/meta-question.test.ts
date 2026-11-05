import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMetaAccessChecker, createMetaExplainer, DemoError, META_MODEL } from "./meta-hiring";
import { FileAttemptBudget } from "./meta-demo-budget";

const config = {
  enabled: true, key: "fictional-provider-key-only",
  origin: "https://fictional-project-demo.worf.replit.dev",
  previewDemo: {
    development: true,
    canonicalOrigin: "https://fictional-project-demo.worf.replit.dev",
    projectId: "fictional-project",
  },
};
const question = {
  profileId: "northstar-studio", consent: true,
  question: "Why does cash fall at first?", history: [],
};
const answer = "### Cash timing\nHiring costs arrive before the additional receipts.\n\n- Check collection timing before changing the plan.";
const providerReply = (text = answer) => new Response(JSON.stringify({
  status: "completed", id: "resp_fictional_qa", model: META_MODEL,
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }],
}), { status: 200 });
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

function setup(fetcher = vi.fn<typeof fetch>(async () => providerReply()), budget = {
  reserve: vi.fn(async () => true),
}) {
  const access = createMetaAccessChecker(() => config, { consume: async () => true });
  const run = createMetaExplainer(() => config, budget, fetcher, access);
  return {
    fetcher, budget, run,
    ask: (body: unknown = question, origin = config.origin) =>
      run(body, origin, "question"),
  };
}

describe("typed fictional owner Q&A — mocked Meta only", () => {
  it.each([
    ["northstar-studio", 309900],
    ["juniper-kitchen", -19840],
  ])("rebuilds %s using authoritative calculator outputs", async (profileId, cash) => {
    const s = setup();
    const history = [{ question: "Which assumptions should I check?", answer: "Check the collection delay." }];
    const result = await s.ask({ ...question, profileId, history });
    const sent = JSON.parse(s.fetcher.mock.calls[0]![1]!.body as string);
    const input = JSON.parse(sent.input);
    expect(input.sample.synthetic).toBe(true);
    expect(input.sample.profileId).toBe(profileId);
    expect(input.sample.calculatorOutputs.scenarios[0].projection.finalEndingCash).toBeCloseTo(cash, 8);
    expect(input.question).toBe(question.question);
    expect(input.conversation).toEqual(history);
    expect(sent.store).toBe(false);
    expect(sent.model).toBe(META_MODEL);
    expect(sent.instructions).toContain("untrusted data");
    expect(sent.instructions).toContain("recalculate locally");
    expect(sent.instructions).toContain("Do not recalculate");
    expect(JSON.stringify(input)).not.toContain(config.key);
    expect(result.text).toBe(answer); // Original text, not a rewritten or fabricated answer.
    expect(s.fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { ...question, consent: false },
    { ...question, profileId: "real-customer" },
    { ...question, question: "" },
    { ...question, question: "   " },
    { ...question, question: "x".repeat(501) },
    { ...question, inputs: { annualSalary: 999999 } },
    { ...question, history: Array.from({ length: 3 }, () => ({ question: "Why?", answer: "Cash timing." })) },
    { ...question, history: [{ question: "Why?", answer: "x".repeat(4001) }] },
    { ...question, history: [{ question: " ", answer: "Cash timing." }] },
  ])("rejects invalid/oversized or non-fictional contracts before reserving budget", async body => {
    const s = setup();
    await expect(s.ask(body)).rejects.toMatchObject({ providerAttemptConsumed: false });
    expect(s.fetcher).not.toHaveBeenCalled();
    expect(s.budget.reserve).not.toHaveBeenCalled();
  });

  it("retains exact-origin protection before paid reservation and allows code-free use", async () => {
    const s = setup();
    await expect(s.ask(question, "https://unrelated.example"))
      .rejects.toMatchObject({ code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false });
    expect(s.budget.reserve).not.toHaveBeenCalled();
    expect(s.fetcher).not.toHaveBeenCalled();
    await expect(s.ask()).resolves.toMatchObject({ profileId: "northstar-studio" });
    expect(s.fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    "Your cash will be $4000.", "The hire costs ten thousand dollars.",
    "You can afford this hire.", "This hire is affordable.", "x".repeat(4001),
  ])(
    "withholds unsupported numeric, assurance or oversized answers without retrying",
    async text => {
      const s = setup(vi.fn<typeof fetch>(async () => providerReply(text)));
      await expect(s.ask()).rejects.toMatchObject({ code: "META_UNSUPPORTED_TEXT", providerAttemptConsumed: true });
      expect(s.budget.reserve).toHaveBeenCalledOnce();
      expect(s.fetcher).toHaveBeenCalledOnce();
    },
  );

  it("counts a provider failure once, retaining safe error details", async () => {
    const s = setup(vi.fn<typeof fetch>(async () => new Response("private upstream body", { status: 429 })));
    let failure: unknown;
    try { await s.ask(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(DemoError);
    expect(failure).toMatchObject({ code: "META_HTTP_429", providerAttemptConsumed: true });
    expect((failure as Error).message).not.toContain("private upstream body");
    expect(s.fetcher).toHaveBeenCalledOnce();
  });

  it("preserves the recorded attempt, gives four more slots at total five, and never refreshes quota", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-qa-budget-"));
    directories.push(dir);
    const file = join(dir, "attempts.json");
    await writeFile(file, JSON.stringify({ attempts: 1 }));
    const budget = new FileAttemptBudget(file, 5);
    const before = await readFile(file, "utf8");
    expect(await budget.status()).toEqual({ total: 5, used: 1, remaining: 4 });
    expect(await readFile(file, "utf8")).toBe(before);
    const fetcher = vi.fn(async () => providerReply());
    const access = createMetaAccessChecker(() => config, { consume: async () => true });
    const run = createMetaExplainer(() => config, budget, fetcher, access);
    for (let i = 0; i < 4; i++) await run(question, config.origin, "question");
    expect(await budget.status()).toEqual({ total: 5, used: 5, remaining: 0 });
    await expect(run(question, config.origin, "question"))
      .rejects.toMatchObject({ code: "DEMO_BUDGET_USED", providerAttemptConsumed: false });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(await new FileAttemptBudget(file, 5).status()).toEqual({ total: 5, used: 5, remaining: 0 });
  });

  it("fails closed on an unreadable counter without contacting the provider", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-qa-invalid-"));
    directories.push(dir);
    const file = join(dir, "attempts.json");
    await writeFile(file, "invalid fixture");
    const fetcher = vi.fn(async () => providerReply());
    const run = createMetaExplainer(() => config, new FileAttemptBudget(file, 5), fetcher,
      createMetaAccessChecker(() => config, { consume: async () => true }));
    await expect(run(question, config.origin, "question"))
      .rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE", providerAttemptConsumed: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readFile(file, "utf8")).toBe("invalid fixture");
  });
});
