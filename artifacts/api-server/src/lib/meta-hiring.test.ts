import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { transform } from "esbuild";
import { buildSamplePayload, createMetaAccessChecker, createMetaExplainer, META_ENDPOINT, META_MODEL, type MetaConfig } from "./meta-hiring";
import { FileAttemptBudget } from "./meta-demo-budget";
import { FileAccessAttemptWindow, type AccessAttemptWindow } from "./meta-access-window";

const runChild = promisify(execFile);
const config: MetaConfig = {
  enabled: true,
  key: "mock-provider-credential",
  origin: "https://project-demo.worf.replit.dev",
  previewDemo: {
    development: true,
    canonicalOrigin: "https://project-demo.worf.replit.dev",
    projectId: "project",
  },
};
const body = { profileId: "northstar-studio", consent: true };
const response = (overrides = {}) => new Response(JSON.stringify({
  id: "resp_mock", model: META_MODEL, status: "completed",
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Tradeoffs: review timing and reserve exposure. Relevant findings: upfront costs affect cash. Follow-up questions: how reliable are collections?" }] }],
  ...overrides,
}), { status: 200, headers: { "Content-Type": "application/json" } });
function memoryWindow(): AccessAttemptWindow {
  let windowStartedAt = Date.now();
  let attempts = 0;
  return {
    async consume(now) {
      if (now - windowStartedAt >= 15 * 60_000) { windowStartedAt = now; attempts = 0; }
      if (attempts >= 20) return false;
      attempts++;
      return true;
    },
  };
}
const checker = (cfg = config, window = memoryWindow(), now?: () => number) =>
  createMetaAccessChecker(() => cfg, window, now);
function setup(cfg = config, fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())) {
  const budget = { reserve: vi.fn().mockResolvedValue(true) };
  return { run: createMetaExplainer(() => cfg, budget, fetcher, checker(cfg)), budget, fetcher };
}
const call = (s: ReturnType<typeof setup>, b: unknown = body, origin = config.origin) => s.run(b, origin);

describe("protected Meta integration — mocked provider, NOT genuine verification", () => {
  it("reuses the byte-identical original calculator on the server", async () => {
    const server = await readFile(new URL("./hiring-decision.ts", import.meta.url), "utf8");
    const frontend = await readFile(new URL("../../../hiresense/src/lib/hiring-decision.ts", import.meta.url), "utf8");
    expect(server).toBe(frontend);
  });
  it.each([
    ["northstar-studio", [300000, 309900, 303540, 301050]],
    ["juniper-kitchen", [19000, -19840, -4520, -15930]],
  ] as const)("uses canonical %s figures and original expected results", (id, expected) => {
    const sample = buildSamplePayload(id);
    const actual = [sample.calculatorOutputs.baseline!.finalEndingCash,
      ...sample.calculatorOutputs.scenarios.map(s => s.status === "calculated" ? s.projection.finalEndingCash : NaN)];
    // Preserve expected dollar results while allowing normal binary floating-point fractions of a cent.
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 2));
  });
  it("makes exactly one fixed-endpoint request with server-owned data and safe validated metadata", async () => {
    const s = setup();
    const result = await call(s);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = s.fetcher.mock.calls[0];
    expect(url).toBe(META_ENDPOINT);
    const sent = JSON.parse(init!.body as string);
    expect(sent.model).toBe("muse-spark-1.3");
    expect(sent.store).toBe(false);
    expect(sent.max_output_tokens).toBe(2500);
    expect(sent.tools).toBeUndefined();
    const sample = JSON.parse(sent.input);
    expect(sample.inputs.currentCash).toBe(180000);
    expect(sample.calculatorOutputs.scenarios[0].projection.months).toHaveLength(12);
    expect(sent.input).not.toContain(config.key);
    expect(JSON.stringify(result)).not.toContain(config.key);
    expect(result.mode).toBe("live"); // Mock contract assertion, not a live verification claim.
    expect(result.profileId).toBe(body.profileId);
  });
  it.each([
    { ...config, enabled: false },
    { ...config, key: undefined },
    { ...config, origin: undefined },
  ])("fails closed for missing configuration before reserving or contacting Meta: %j", async cfg => {
    const s = setup(cfg);
    await expect(call(s)).rejects.toMatchObject({ status: 503 });
    expect(s.budget.reserve).not.toHaveBeenCalled();
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it.each(["https://evil.test", undefined, "https://hiresense.test/"])("denies a nonmatching Origin without a paid request", async origin => {
    const s = setup();
    await expect(s.run(body, origin)).rejects.toMatchObject({ status: 403 });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, consent: false }, { profileId: "other", consent: true },
    { ...body, prompt: "arbitrary text" }, { ...body, inputs: { currentCash: 1 } },
    { ...body, document: "forbidden" }, null, {},
  ])("rejects arbitrary payloads and missing consent: %j", async b => {
    const s = setup();
    await expect(call(s, b)).rejects.toMatchObject({ status: 400 });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("bounds repeated access attempts even before provider access", async () => {
    const s = setup();
    const check = checker();
    const limitedRun = createMetaExplainer(() => config, s.budget, s.fetcher, check);
    for (let i = 0; i < 20; i++) await expect(check(config.origin)).resolves.toBeDefined();
    await expect(limitedRun(body, config.origin)).rejects.toMatchObject({ status: 429, code: "ACCESS_LIMIT" });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("does not call provider when the durable budget is exhausted or inaccessible", async () => {
    const s = setup(); s.budget.reserve.mockResolvedValue(false);
    await expect(call(s)).rejects.toMatchObject({ code: "DEMO_BUDGET_USED" });
    s.budget.reserve.mockRejectedValue(new Error("disk failure"));
    await expect(call(s)).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(s.fetcher).not.toHaveBeenCalled();
  });
  it("prevents concurrent provider calls", async () => {
    let resolve!: (value: Response) => void;
    const provider = vi.fn<typeof fetch>().mockImplementation(() => new Promise(r => { resolve = r; }));
    const s = setup(config, provider);
    const first = call(s);
    await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce());
    await expect(call(s)).rejects.toMatchObject({ code: "DEMO_BUSY" });
    resolve(response());
    await first;
    expect(provider).toHaveBeenCalledOnce();
  });
  it.each([401, 402, 403, 404, 429, 500])("reports HTTP %i safely without retries or raw upstream error details", async status => {
    const provider = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive upstream details", { status }));
    const s = setup(config, provider);
    try { await call(s); expect.fail("should reject"); }
    catch (e) {
      expect(e).toMatchObject({ code: `META_HTTP_${status}`, status: 502, providerAttemptConsumed: true });
      expect(String(e)).not.toContain("sensitive upstream details");
      expect(String(e)).not.toContain(config.key);
    }
    expect(provider).toHaveBeenCalledOnce();
    expect(s.budget.reserve).toHaveBeenCalledOnce();
  });
  it("handles network failure without exposing thrown errors or retrying", async () => {
    const s = setup(config, vi.fn<typeof fetch>().mockRejectedValue(new Error("do-not-expose")));
    await expect(call(s)).rejects.toMatchObject({ code: "META_NETWORK_OR_TIMEOUT" });
    expect(s.fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    { status: "incomplete" }, { model: "different-provider" }, { id: "" }, { output: [] },
    { output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Cash is $999." }] }] },
  ])("withholds incomplete, mismatched or unsupported provider output", async overrides => {
    const s = setup(config, vi.fn<typeof fetch>().mockResolvedValue(response(overrides)));
    await expect(call(s)).rejects.toMatchObject({ status: 502 });
    expect(s.fetcher).toHaveBeenCalledOnce();
  });
  it("does not accept malformed provider JSON as genuine", async () => {
    const s = setup(config, vi.fn<typeof fetch>().mockResolvedValue(new Response("{")));
    await expect(call(s)).rejects.toMatchObject({ code: "META_INVALID_RESPONSE" });
  });
});

describe("availability-only checking — cannot contact Meta or reserve a provider attempt", () => {
  it("accepts the configured Origin without a passcode or provider call", async () => {
    const forbiddenNetwork = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("Access checking must not fetch"); });
    const s = setup();
    const check = checker();
    const result = await check(config.origin);
    expect(result).toEqual({ status: "allowed", providerRequestMade: false, providerAttemptConsumed: false });
    expect(s.fetcher).not.toHaveBeenCalled();
    expect(s.budget.reserve).not.toHaveBeenCalled();
    expect(forbiddenNetwork).not.toHaveBeenCalled();
  });
  it.each(["https://other.test", undefined, config.origin + "/"])("denies nonmatching Origin without contacting Meta", async origin => {
    const check = checker();
    const error = await check(origin).catch(rejection => rejection);
    expect(error).toMatchObject({ code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false });
    expect(JSON.stringify({ code: error.code, message: error.message, diagnostics: error.diagnostics })).not.toContain(config.key);
  });
  it("shares the unchanged twenty-access window with explanation authorization", async () => {
    const check = checker();
    const s = setup();
    const run = createMetaExplainer(() => config, s.budget, s.fetcher, check);
    for (let i = 0; i < 20; i++) await check(config.origin);
    await expect(run(body, config.origin)).rejects.toMatchObject({ code: "ACCESS_LIMIT", providerAttemptConsumed: false });
    expect(s.fetcher).not.toHaveBeenCalled();
    expect(s.budget.reserve).not.toHaveBeenCalled();
  });
  it("sanitizes address diagnostics rather than exposing raw headers, userinfo or paths", async () => {
    const check = checker();
    const error = await check("https://unlogged-user:unlogged-password@other.test/path?private=query")
      .catch(rejection => rejection);
    expect(error).toMatchObject({ diagnostics: { receivedOrigin: "https://other.test", allowedOrigin: config.origin } });
    expect(JSON.stringify({ message: error.message, diagnostics: error.diagnostics })).not.toMatch(/unlogged|private|query/);
  });
});

describe("persistent access window — fixture metadata only, no provider requests", () => {
  async function withStore(test: (file: string) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-access-window-"));
    try { await test(join(dir, "access-window.json")); }
    finally { await rm(dir, { recursive: true, force: true }); }
  }

  it("keeps the twenty-attempt limit across checker restarts and expires at fifteen minutes", async () => {
    await withStore(async file => {
      let now = 1_800_000_000_000;
      const first = checker(config, new FileAccessAttemptWindow(file), () => now);
      for (let i = 0; i < 20; i++) await expect(first(config.origin)).resolves.toBeDefined();
      const raw = await readFile(file, "utf8");
      expect(JSON.parse(raw)).toEqual({ windowStartedAt: now, attempts: 20 });
      expect(raw).not.toContain(config.key);

      const restarted = checker(config, new FileAccessAttemptWindow(file), () => now);
      await expect(restarted(config.origin)).rejects.toMatchObject({ code: "ACCESS_LIMIT" });
      now += 15 * 60_000;
      expect((await restarted(config.origin)).status).toBe("allowed");
    });
  });

  it("serializes concurrent reservations across checker instances without exceeding twenty", async () => {
    await withStore(async file => {
      const now = () => 1_800_000_000_000;
      const checkers = [checker(config, new FileAccessAttemptWindow(file), now), checker(config, new FileAccessAttemptWindow(file), now)];
      const outcomes = await Promise.all(Array.from({ length: 36 }, (_, i) =>
        checkers[i % checkers.length](config.origin).then(() => true, error => {
          if (error?.code === "ACCESS_LIMIT") return false;
          throw error;
        })));
      expect(outcomes.filter(Boolean)).toHaveLength(20);
      expect(JSON.parse(await readFile(file, "utf8")).attempts).toBe(20);
    });
  });

  it("enforces the twenty-attempt limit across concurrent worker processes", async () => {
    await withStore(async file => {
      const source = await readFile(new URL("./meta-access-window.ts", import.meta.url), "utf8");
      const { code: compiledWindow } = await transform(source, { loader: "ts", format: "esm", target: "node20" });
      const moduleFile = `${file}.mjs`;
      await writeFile(moduleFile, compiledWindow, { mode: 0o600 });
      const worker = `
        import { pathToFileURL } from "node:url";
        const { FileAccessAttemptWindow } = await import(pathToFileURL(process.env.ACCESS_WINDOW_MODULE).href);
        const accessWindow = new FileAccessAttemptWindow(process.env.ACCESS_WINDOW_FILE);
        const results = await Promise.all(Array.from(
          { length: Number(process.env.ACCESS_WINDOW_RESERVATIONS) },
          () => accessWindow.consume(Number(process.env.ACCESS_WINDOW_NOW)),
        ));
        process.stdout.write(JSON.stringify(results));
      `;
      const now = 1_800_000_000_000;
      const workerCount = 4;
      const reservationsPerWorker = 8;
      const workerResults = await Promise.all(Array.from({ length: workerCount }, async () => {
        const { stdout } = await runChild(process.execPath, ["--input-type=module", "-e", worker], {
          timeout: 15_000,
          env: {
            ...process.env,
            ACCESS_WINDOW_MODULE: moduleFile,
            ACCESS_WINDOW_FILE: file,
            ACCESS_WINDOW_NOW: String(now),
            ACCESS_WINDOW_RESERVATIONS: String(reservationsPerWorker),
          },
        });
        return JSON.parse(stdout) as boolean[];
      }));
      const results = workerResults.flat();
      expect(results).toHaveLength(workerCount * reservationsPerWorker);
      expect(results.filter(Boolean)).toHaveLength(20);
      expect(results.filter(result => !result)).toHaveLength(12);

      const serialized = await readFile(file, "utf8");
      const metadata: unknown = JSON.parse(serialized);
      expect(serialized.length).toBeLessThanOrEqual(256);
      expect(metadata).toEqual({ windowStartedAt: now, attempts: 20 });
      expect(Object.keys(metadata as object).sort()).toEqual(["attempts", "windowStartedAt"]);
    });
  });

  it("recovers an interrupted lock from a dead owner without resetting window metadata", async () => {
    await withStore(async file => {
      const child = spawn(process.execPath, ["-e", "process.exit(0)"]);
      const ownerPid = child.pid;
      expect(ownerPid).toBeDefined();
      await new Promise<void>(resolve => child.once("exit", () => resolve()));

      const now = 1_800_000_000_000;
      const windowStartedAt = now - 30_000;
      await writeFile(file, JSON.stringify({ windowStartedAt, attempts: 7 }));
      await writeFile(`${file}.lock`, `${ownerPid}\n`);

      const check = checker(config, new FileAccessAttemptWindow(file), () => now);
      expect((await check(config.origin)).status).toBe("allowed");
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ windowStartedAt, attempts: 8 });
      await expect(readFile(`${file}.lock`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("preserves a live lock when concurrent checks cannot acquire it", async () => {
    await withStore(async file => {
      const now = 1_800_000_000_000;
      const metadata = { windowStartedAt: now - 30_000, attempts: 7 };
      const owner = `${process.pid}\n`;
      await writeFile(file, JSON.stringify(metadata));
      await writeFile(`${file}.lock`, owner);

      const checkers = [checker(config, new FileAccessAttemptWindow(file, 40), () => now),
        checker(config, new FileAccessAttemptWindow(file, 40), () => now)];
      await Promise.all(checkers.map(check =>
        expect(check(config.origin)).rejects.toMatchObject({ status: 503, code: "ACCESS_WINDOW_UNAVAILABLE" })));

      expect(await readFile(`${file}.lock`, "utf8")).toBe(owner);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual(metadata);
    });
  });

  it("fails closed when persistent window storage is unavailable", async () => {
    await withStore(async file => {
      const blocker = `${file}.parent`;
      await writeFile(blocker, "fixture");
      const check = checker(config, new FileAccessAttemptWindow(join(blocker, "access-window.json")));
      await expect(check(config.origin)).rejects.toMatchObject({ status: 503, code: "ACCESS_WINDOW_UNAVAILABLE" });
    });
  });
});

describe("persistent attempt quota", () => {
  it("counts reservations across new instances and never auto-resets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-budget-"));
    try {
      const file = join(dir, "attempts.json");
      expect(await new FileAttemptBudget(file, 1).reserve()).toBe(true);
      expect(await new FileAttemptBudget(file, 1).reserve()).toBe(false);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ attempts: 1 });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
