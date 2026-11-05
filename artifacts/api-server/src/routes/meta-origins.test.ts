import { describe, expect, it, vi } from "vitest";
import { Router } from "express";
import pino from "pino";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { createMetaHiringRouter, configuredAttemptLimit } from "./meta-hiring";
import { FileAttemptBudget } from "../lib/meta-demo-budget";
import { createMetaAccessChecker, isDevelopmentPreviewRuntime, type MetaConfig } from "../lib/meta-hiring";

const original = "https://c4a56441-f3ce-4a68-ad0f-2ee1024e8018-00-1s7v86dju91li.worf.replit.dev";
const preview = "https://c4a56441-f3ce-4a68-ad0f-2ee1024e8018-00-1s7v86dju91li-85pafxq1.worf.replit.dev";
const config: MetaConfig = {
  enabled: true, key: "mock-origin-provider-key",
  origin: original, additionalOrigin: preview,
  previewDemo: {
    development: true, canonicalOrigin: original,
    projectId: "c4a56441-f3ce-4a68-ad0f-2ee1024e8018:85pafxq1",
  },
};
const previewConfig = config;

describe("shared demo request cap configuration", () => {
  it("allows a bounded total of twenty without accepting unbounded or invalid values", () => {
    expect(configuredAttemptLimit("20")).toBe(20);
    expect(configuredAttemptLimit("21")).toBe(0);
    expect(configuredAttemptLimit("0")).toBe(0);
    expect(configuredAttemptLimit("not-a-number")).toBe(0);
    expect(configuredAttemptLimit(undefined)).toBe(1);
  });
});

describe("code-free development demo — mocked provider only", () => {
  it.each(["", "not-an-origin"])("fails closed on malformed runtime origin metadata: %s", async canonicalOrigin => {
    const check = createMetaAccessChecker(() => ({
      ...config,
      previewDemo: { ...config.previewDemo!, canonicalOrigin },
    }), { consume: async () => true });
    await expect(check(original)).rejects.toMatchObject({
      code: "PREVIEW_DEMO_UNAVAILABLE", providerAttemptConsumed: false,
    });
  });

  it.each([
    ["development", undefined, true],
    ["production", undefined, false],
    ["development", "1", false],
    ["development", "true", false],
  ] as const)("uses app/deployment signals rather than Replit's platform environment: %s / %s", (nodeEnv, deployment, expected) => {
    expect(isDevelopmentPreviewRuntime(nodeEnv, deployment)).toBe(expected);
  });
  it.each([original, preview])("allows non-billable no-code eligibility and both explicit provider paths: %s", async origin => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-no-code-"));
    const ledger = join(dir, "budget.json");
    await writeFile(ledger, '{"attempts":1}');
    vi.stubEnv("HIRESENSE_META_ACCESS_WINDOW_FILE", join(dir, "access.json"));
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      status: "completed", model: "muse-spark-1.3", id: "resp_mock_no_code",
      output: [{ type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "Tradeoffs: receipts can lag costs. Findings: check timing. Questions: are collections reliable?" }] }],
    })));
    const app = createApp({
      logger: pino({ enabled: false }),
      router: Router().use(createMetaHiringRouter({
        config: () => previewConfig, budget: new FileAttemptBudget(ledger, 5), fetcher,
      })),
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hiring/`;
    const invoke = async (path: string, body = {}, receivedOrigin = origin) => {
      const response = await fetch(base + path, { method: "POST",
        headers: { Origin: receivedOrigin, "Content-Type": "application/json" },
        body: JSON.stringify(body) });
      expect(response.headers.get("X-HireSense-Service")).toBe("preview-no-code-v1");
      return { status: response.status, body: await response.json() };
    };
    try {
      const before = await readFile(ledger, "utf8");
      expect(await invoke("demo-access")).toMatchObject({ status: 200, body: {
        status: "allowed", providerRequestMade: false, providerAttemptConsumed: false,
        budget: { total: 5, used: 1, remaining: 4 },
      } });
      expect(await invoke("demo-access", {}, "https://unrelated.replit.dev"))
        .toMatchObject({ status: 403, body: { code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false } });
      const sample = { profileId: "northstar-studio", consent: true };
      expect((await invoke("meta-explanation", { ...sample, consent: false })).status).toBe(400);
      expect((await invoke("meta-question", { ...sample, question: "Q", history: [], currentCash: 0 })).status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
      expect(await readFile(ledger, "utf8")).toBe(before);
      expect(await invoke("meta-explanation", sample)).toMatchObject({ status: 200, body: {
        profileId: "northstar-studio", budget: { total: 5, used: 2, remaining: 3 },
      } });
      expect(await invoke("meta-question", { ...sample, question: "Which timing assumptions matter?", history: [] }))
        .toMatchObject({ status: 200, body: { budget: { total: 5, used: 3, remaining: 2 } } });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    { ...previewConfig, previewDemo: { ...previewConfig.previewDemo!, development: false } },
    { ...previewConfig, previewDemo: { ...previewConfig.previewDemo!, projectId: "another-project" } },
    { ...previewConfig, previewDemo: { ...previewConfig.previewDemo!, canonicalOrigin: "https://unrelated.example" } },
    { ...previewConfig, additionalOrigin: "https://unrelated.replit.dev" },
    { ...previewConfig, origin: "https://public-production.example" },
  ])("fails closed outside the verified development runtime/address set", async cfg => {
    const check = createMetaAccessChecker(() => cfg, { consume: async () => true });
    await expect(check(original)).rejects.toMatchObject({
      code: "PREVIEW_DEMO_UNAVAILABLE", providerAttemptConsumed: false,
    });
  });

  it("preserves the shared access limit without needing a code", async () => {
    let count = 0;
    const check = createMetaAccessChecker(() => previewConfig, { consume: async () => ++count <= 20 });
    for (let i = 0; i < 20; i++) await check(original);
    await expect(check(preview)).rejects.toMatchObject({ code: "ACCESS_LIMIT", providerAttemptConsumed: false });
  });
});

describe("exact HireSense Preview origins — no real provider or real counters", () => {
  it.each([original, preview])("uses the same explicit origin guard on access and questions: %s", async origin => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-origins-"));
    const ledger = join(dir, "budget.json");
    await writeFile(ledger, '{"attempts":1}');
    vi.stubEnv("HIRESENSE_META_ACCESS_WINDOW_FILE", join(dir, "access.json"));
    const budget = new FileAttemptBudget(ledger, 5);
    const reserve = vi.spyOn(budget, "reserve");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      status: "completed", model: "muse-spark-1.3", id: "resp_mock_exact_origin",
      output: [{ type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "Mocked fixture: compare collection timing with hiring costs." }] }],
    })));
    const app = createApp({
      logger: pino({ enabled: false }),
      router: Router().use(createMetaHiringRouter({ config: () => config, budget, fetcher })),
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hiring/`;
    const invoke = async (path: string, receivedOrigin = origin, body?: unknown) => {
      const response = await fetch(url + path, {
        method: "POST",
        headers: {
          Origin: receivedOrigin, "Content-Type": "application/json",
          // Even these trusted-looking proxy headers must not override a foreign Origin.
          Host: new URL(preview).host, "X-Forwarded-Host": new URL(preview).host,
          "X-Forwarded-Proto": "https",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    try {
      const before = await readFile(ledger, "utf8");
      const checked = await invoke("demo-access");
      expect(checked.status).toBe(200);
      expect(checked.body).toMatchObject({
        providerRequestMade: false, providerAttemptConsumed: false,
        budget: { total: 5, used: 1, remaining: 4 },
      });
      expect(await readFile(ledger, "utf8")).toBe(before);
      const question = { profileId: "northstar-studio", consent: true, question: "Which timing assumptions should I check?", history: [] };
      for (const path of ["demo-access", "meta-question"]) {
        const wrongOrigin = await invoke(path, original + ".unrelated.example", path === "meta-question" ? question : undefined);
        expect(wrongOrigin).toMatchObject({ status: 403, body: { code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false } });
      }
      expect(reserve).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(await readFile(ledger, "utf8")).toBe(before);
      const explained = await invoke("meta-question", origin, question);
      expect(explained).toMatchObject({ status: 200, body: {
        mode: "live", profileId: "northstar-studio", model: "muse-spark-1.3",
        budget: { total: 5, used: 2, remaining: 3 },
      } });
      expect(reserve).toHaveBeenCalledOnce();
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.each([
    preview + "/", preview + ".unrelated.example",
    preview.replace("-85pafxq1", "-another"), "https://unrelated.replit.dev", "null", undefined,
  ])("does not infer additional trusted origins: %s", async origin => {
    const check = createMetaAccessChecker(() => config, { consume: async () => true });
    await expect(check(origin)).rejects.toMatchObject({
      code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false,
    });
  });

  it.each(["*", "https://*.worf.replit.dev", "null", preview + "/", preview + "?query=not-an-origin"])(
    "fails closed on malformed additional-origin configuration: %s", async additionalOrigin => {
      const check = createMetaAccessChecker(() => ({ ...config, additionalOrigin }), { consume: async () => true });
      await expect(check(original)).rejects.toMatchObject({
        code: "DEMO_PROTECTION_MISSING", providerAttemptConsumed: false,
      });
    },
  );
});
