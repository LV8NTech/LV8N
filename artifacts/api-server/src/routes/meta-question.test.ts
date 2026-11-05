import { describe, expect, it, vi } from "vitest";
import { Router } from "express";
import pino from "pino";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app";
import { createMetaHiringRouter } from "./meta-hiring";
import { FileAttemptBudget } from "../lib/meta-demo-budget";

describe("Q&A HTTP integration — local server and mocked provider only", () => {
  it("checks quota without billing, accepts bounded context, shares limits and never logs transcripts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hiresense-question-http-"));
    const file = join(dir, "budget.json");
    await writeFile(file, '{"attempts":1}');
    vi.stubEnv("HIRESENSE_META_ACCESS_WINDOW_FILE", join(dir, "access.json"));
    const lines: string[] = [];
    const logger = pino({ base: null }, { write: (line: string) => { lines.push(line); } });
    const config = {
      enabled: true, key: "fictional-http-provider-key",
      origin: "https://fictional-project-demo.worf.replit.dev",
      previewDemo: {
        development: true,
        canonicalOrigin: "https://fictional-project-demo.worf.replit.dev",
        projectId: "fictional-project",
      },
    };
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      status: "completed", model: "muse-spark-1.3", id: "resp_fictional_http",
      output: [{
        type: "message", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "### Timing\nReceipts can arrive after costs.\n\n- Check collection assumptions." }],
      }],
    })));
    const app = createApp({
      logger,
      router: Router().use(createMetaHiringRouter({ config: () => config, budget: new FileAttemptBudget(file, 5), fetcher })),
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hiring/`;
    const invoke = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const response = await fetch(base + path, {
        method: "POST",
        headers: {
          Origin: config.origin, "Content-Type": "application/json",
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    try {
      const before = await readFile(file, "utf8");
      const checked = await invoke("demo-access");
      expect(checked.status).toBe(200);
      expect(checked.body.budget).toEqual({ total: 5, used: 1, remaining: 4 });
      expect(checked.body.model).toBe("muse-spark-1.3");
      expect(await readFile(file, "utf8")).toBe(before);
      expect(fetcher).not.toHaveBeenCalled();

      const question = {
        profileId: "northstar-studio", consent: true,
        question: "Why does cash fall? fictional-private-question-marker",
        history: [{ question: "What should I check?", answer: "fictional-prior-answer-marker " + "a".repeat(2400) }],
      };
      const foreign = await invoke("meta-question", question, { Origin: "https://unrelated.example" });
      expect(foreign.body.code).toBe("DEMO_ORIGIN_DENIED");
      expect(foreign.body.providerAttemptConsumed).toBe(false);
      const noConsent = await invoke("meta-question", { ...question, consent: false });
      expect(noConsent.status).toBe(400);
      expect(noConsent.body.providerAttemptConsumed).toBe(false);
      const edited = await invoke("meta-question", { ...question, inputs: { annualSalary: 999999 } });
      expect(edited.status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();

      const answered = await invoke("meta-question", question);
      expect(answered.status).toBe(200);
      expect(answered.body.mode).toBe("live"); // Mock contract assertion, NOT genuine live evidence.
      expect(answered.body.budget).toEqual({ total: 5, used: 2, remaining: 3 });
      const sent = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(sent.store).toBe(false);
      expect(JSON.parse(sent.input).conversation).toEqual(question.history);

      // Legacy explanations and new questions consume the SAME unchanged ledger.
      expect((await invoke("meta-explanation", { profileId: "northstar-studio", consent: true })).status).toBe(200);
      await invoke("meta-question", question);
      const last = await invoke("meta-question", question);
      expect(last.body.budget).toEqual({ total: 5, used: 5, remaining: 0 });
      const exhausted = await invoke("meta-question", question);
      expect(exhausted.status).toBe(429);
      expect(exhausted.body.code).toBe("DEMO_BUDGET_USED");
      expect(exhausted.body.providerAttemptConsumed).toBe(false);
      expect(exhausted.body.budget.remaining).toBe(0);
      expect(fetcher).toHaveBeenCalledTimes(4);

      const tooLarge = await invoke("meta-question", { ...question, question: "x".repeat(33000) });
      expect(tooLarge.status).toBe(413);
      const oldRouteLimit = await invoke("meta-explanation", { ...question, question: "x".repeat(3000) });
      // Both custom-scenario endpoints now accept bounded 32 KB bodies, but
      // question-shaped payloads remain invalid on the review endpoint.
      expect(oldRouteLimit.status).toBe(400);
      expect(oldRouteLimit.body).toMatchObject({ code: "SAMPLE_ONLY" });
      const logs = lines.join("\n");
      for (const privateFixture of [
        config.key,
        question.question, "fictional-prior-answer-marker", "Timing\\nReceipts",
      ]) expect(logs).not.toContain(privateFixture);
      expect(logs).toContain("validated_provider_response");
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
