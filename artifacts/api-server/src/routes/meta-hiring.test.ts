import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { createLogger } from "../lib/logger";

let server: Server, base: string;
let fixtureDir: string;
let routeFixtureNumber = 0;
const fixtureOrigin = "https://fixture-project-demo.worf.replit.dev";
let createTestApp: typeof import("../app").createApp;
let createTestHiringRouter: typeof import("./meta-hiring").createMetaHiringRouter;
beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "hiresense-route-window-"));
  vi.stubEnv(
    "HIRESENSE_META_ACCESS_WINDOW_FILE",
    join(fixtureDir, "access-window.json"),
  );
  const routeModule = await import("./meta-hiring");
  createTestHiringRouter = routeModule.createMetaHiringRouter;
  const appModule = await import("../app");
  createTestApp = appModule.createApp;
  const app = appModule.default;
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/hiring/meta-explanation`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(fixtureDir, { recursive: true, force: true });
});
beforeEach(() => {
  vi.stubEnv(
    "HIRESENSE_META_ACCESS_WINDOW_FILE",
    join(fixtureDir, `harness-window-${++routeFixtureNumber}.json`),
  );
  vi.stubEnv("HIRESENSE_META_ENABLED", "true");
  vi.stubEnv("Meta_model_api_key", "mock-provider-key");
  vi.stubEnv("HIRESENSE_META_ALLOWED_ORIGIN", fixtureOrigin);
  vi.stubEnv("HIRESENSE_META_ADDITIONAL_ORIGIN", "");
  vi.stubEnv("HIRESENSE_META_DEV_PREVIEW_NO_CODE", "true");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("REPLIT_DEPLOYMENT", "0");
  vi.stubEnv("REPLIT_DEV_DOMAIN", "fixture-project-demo.worf.replit.dev");
  vi.stubEnv("REPL_ID", "fixture-project");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
const post = (body: string, headers: Record<string, string> = {}) =>
  fetch(base, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: fixtureOrigin,
      ...headers,
    },
    body,
  });

describe("HTTP diagnostic privacy — fictional fixtures and mocked provider only", () => {
  const fixtureKey = "fictional-regression-provider-key";
  const fixtureHeaders = {
    authorization: "Bearer fictional-header-authorization",
    cookie: "fictional-header-cookie",
    "x-fixture-complete-headers": "fictional-complete-header-value",
  };
  const financialFixture = "fictional-financial-payload-8675309";
  const upstreamFixture = "fictional-raw-upstream-error-details";
  const networkFixture = "fictional-raw-network-error-details";
  const originUserInfo = "fictional-origin-userinfo";
  const originPassword = "fictional-origin-password";
  const originPath = "fictional-origin-private-path";
  const originQuery = "fictional-origin-private-query";
  const requestQuery = "fictional-private-query-marker";
  const foreignOrigin = `https://${originUserInfo}:${originPassword}@foreign.test/${originPath}?secret=${originQuery}`;
  const sensitiveValues = [
    fixtureKey,
    ...Object.values(fixtureHeaders),
    financialFixture,
    upstreamFixture,
    networkFixture,
    originUserInfo,
    originPassword,
    originPath,
    originQuery,
    requestQuery,
    "fictional-response-header",
  ];

  async function makeHarness(fetcher: typeof fetch) {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const testLogger = createLogger(sink);
    const testRouter = createTestHiringRouter({
      config: () => ({
        enabled: true,
        key: fixtureKey,
        origin: "https://fixture-project-demo.worf.replit.dev",
        previewDemo: {
          development: true,
          canonicalOrigin: "https://fixture-project-demo.worf.replit.dev",
          projectId: "fixture-project",
        },
      }),
      budget: { reserve: vi.fn().mockResolvedValue(true) },
      fetcher,
    });
    const testServer = createServer(
      createTestApp({ logger: testLogger, router: testRouter }),
    );
    await new Promise<void>((resolve) =>
      testServer.listen(0, "127.0.0.1", resolve),
    );
    const address = testServer.address() as AddressInfo;
    const request = (
      path: string,
      body?: string,
      headers: Record<string, string> = {},
    ) =>
      fetch(`http://127.0.0.1:${address.port}/api/hiring/${path}`, {
        method: "POST",
        headers: { Origin: "https://fixture-project-demo.worf.replit.dev", ...headers },
        ...(body === undefined ? {} : { body }),
      });
    return {
      chunks,
      logger: testLogger,
      request,
      async close() {
        testLogger.flush();
        await new Promise<void>((resolve, reject) =>
          testServer.close((error) => (error ? reject(error) : resolve())),
        );
        await new Promise<void>((resolve) => testLogger.flush(resolve));
      },
    };
  }

  function expectNoSensitiveValues(text: string) {
    for (const value of sensitiveValues) expect(text).not.toContain(value);
  }

  it("redacts complete header and body objects if attached to a logger record", async () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const testLogger = createLogger(sink);
    testLogger.info(
      {
        headers: fixtureHeaders,
        req: { headers: fixtureHeaders, body: { financialFixture } },
        res: {
          headers: {
            "x-fixture-complete-headers": "fictional-response-header",
          },
        },
      },
      "fictional privacy regression fixture",
    );
    await new Promise<void>((resolve) => testLogger.flush(resolve));
    const output = chunks.join("");
    expectNoSensitiveValues(output);
    expect(output).toContain("fictional privacy regression fixture");
  });

  it("omits private query values from HTTP logs and error responses", async () => {
    const h = await makeHarness(vi.fn<typeof fetch>());
    try {
      const response = await h.request(
        `demo-access?private=${encodeURIComponent(requestQuery)}`,
      );
      expect(response.status).toBe(200);
      const responseBody = await response.text();
      expect(responseBody).toContain('"status":"allowed"');
      expectNoSensitiveValues(responseBody);

      await new Promise<void>((resolve) => h.logger.flush(resolve));
      const logs = h.chunks.join("");
      expectNoSensitiveValues(logs);
      expect(logs).toContain('"url":"/api/hiring/demo-access"');
    } finally {
      await h.close();
    }
  });

  it("keeps request credentials, financial data, origins and upstream errors out of HTTP logs and errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(upstreamFixture, { status: 500 }))
      .mockRejectedValueOnce(new Error(networkFixture));
    const h = await makeHarness(fetcher);
    const responses: string[] = [];
    try {
      const accessHeaders = { ...fixtureHeaders };
      const access = await h.request("demo-access", undefined, {
        Origin: fixtureOrigin,
      });
      expect(access.status).toBe(200);
      responses.push(await access.text());

      const foreign = await h.request("demo-access", undefined, {
        Origin: foreignOrigin,
      });
      expect(foreign.status).toBe(403);
      const foreignBody = await foreign.text();
      expect(foreignBody).toContain('"receivedOrigin":"https://foreign.test"');
      expect(foreignBody).toContain(`"allowedOrigin":"${fixtureOrigin}"`);
      responses.push(foreignBody);

      const malformed = await h.request(
        "meta-explanation",
        `{"financial":"${financialFixture}",`,
        {
          "content-type": "application/json",
        },
      );
      expect(malformed.status).toBe(400);
      const malformedBody = await malformed.text();
      expect(malformedBody).toContain("INVALID_REQUEST");
      responses.push(malformedBody);

      const financialBody = await h.request(
        "meta-explanation",
        JSON.stringify({
          profileId: "northstar-studio",
          consent: true,
          inputs: { currentCash: financialFixture },
        }),
        { "content-type": "application/json" },
      );
      expect(financialBody.status).toBe(400);
      const financialError = await financialBody.text();
      expect(financialError).toContain("INPUTS_INVALID");
      responses.push(financialError);

      const providerFailure = await h.request(
        "meta-explanation",
        JSON.stringify({
          profileId: "northstar-studio",
          consent: true,
        }),
        { "content-type": "application/json" },
      );
      expect(providerFailure.status).toBe(502);
      const providerError = await providerFailure.text();
      expect(providerError).toContain("META_HTTP_500");
      expect(providerError).toContain('"providerAttemptConsumed":true');
      responses.push(providerError);
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: `Bearer ${fixtureKey}`,
      });

      const networkFailure = await h.request(
        "meta-explanation",
        JSON.stringify({
          profileId: "northstar-studio",
          consent: true,
        }),
        { ...fixtureHeaders, "content-type": "application/json" },
      );
      expect(networkFailure.status).toBe(502);
      const networkError = await networkFailure.text();
      expect(networkError).toContain("META_NETWORK_OR_TIMEOUT");
      expect(networkError).toContain('"providerAttemptConsumed":true');
      responses.push(networkError);
      expect(fetcher).toHaveBeenCalledTimes(2);

      await new Promise<void>((resolve) => h.logger.flush(resolve));
      const logs = h.chunks.join("");
      expect(logs).toContain("DEMO_ORIGIN_DENIED");
      expect(logs).toContain("META_HTTP_500");
      expect(logs).toContain("META_NETWORK_OR_TIMEOUT");
      expect(logs).toContain('"status":502');
      expect(logs).toContain('"providerAttemptConsumed":true');
      expect(logs).toContain('"receivedOrigin":"https://foreign.test"');
      expectNoSensitiveValues(logs);
      expectNoSensitiveValues(responses.join("\n"));
    } finally {
      await h.close();
    }
  });
});
describe("HTTP protection — no live provider calls", () => {
  const check = (headers: Record<string, string> = {}, body?: string) =>
    fetch(base.replace("meta-explanation", "demo-access"), {
      method: "POST",
      headers: {
        Origin: fixtureOrigin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body,
    });
  it("checks access on the real HTTP route without creating any provider response", async () => {
    const res = await check();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "allowed",
      providerRequestMade: false,
      providerAttemptConsumed: false,
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("still enforces the configured Origin without requiring a passcode", async () => {
    const allowed = await check();
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ status: "allowed", providerAttemptConsumed: false });

    const denied = await check({ Origin: "https://other.test" });
    expect(denied.status).toBe(403);
    const json = await denied.json();
    expect(json).toMatchObject({ code: "DEMO_ORIGIN_DENIED", providerAttemptConsumed: false });
    expect(JSON.stringify(json)).not.toContain("mock-provider-key");
  });
  it("rejects financial inputs or prompts on the access-only route", async () => {
    const res = await check(
      {},
      JSON.stringify({ inputs: { currentCash: 999 }, prompt: "forbidden" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "ACCESS_BODY_FORBIDDEN",
      providerAttemptConsumed: false,
    });
  });
  it("rejects extra financial inputs through the real API route", async () => {
    const res = await post(
      JSON.stringify({
        profileId: "northstar-studio",
        consent: true,
        inputs: { currentCash: 999 },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INPUTS_INVALID" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects foreign Origins and accepts code-free requests for normal validation", async () => {
    expect((await post("{}", { Origin: "https://evil.test" })).status).toBe(
      403,
    );
    const accepted = await post("{}");
    expect(accepted.status).toBe(400);
    expect(await accepted.json()).toMatchObject({ code: "SAMPLE_ONLY" });
  });
  it("rejects oversized documents before any request handling", async () => {
    const res = await post(JSON.stringify({ document: "x".repeat(40000) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "INVALID_REQUEST" });
  });
  it("does not echo malformed request content", async () => {
    const res = await post('{"do-not-echo":');
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("do-not-echo");
  });
});
