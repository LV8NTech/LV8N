import { Router } from "express";
import {
  createMetaAccessChecker,
  createMetaExplainer,
  DemoError,
  META_MODEL,
  metaConfig,
  type AttemptBudget,
  type MetaConfig,
} from "../lib/meta-hiring";
import { CheckHiringDemoAccessResponse } from "@workspace/api-zod";
import { FileAttemptBudget } from "../lib/meta-demo-budget";
import { DurableBudget, DurableAccessWindow } from "../lib/meta-durable";

const MAX_SHARED_DEMO_ATTEMPTS = 20;

export function configuredAttemptLimit(value: string | undefined): number {
  const configured = Number(value ?? "1");
  return Number.isSafeInteger(configured) && configured >= 1 && configured <= MAX_SHARED_DEMO_ATTEMPTS
    ? configured
    : 0;
}

export function createMetaHiringRouter(
  dependencies: {
    config?: () => MetaConfig;
    budget?: AttemptBudget;
    fetcher?: typeof fetch;
  } = {},
) {
  // Fail closed on bad configuration; hard maximum prevents an accidentally unbounded endpoint.
  const config = dependencies.config ?? metaConfig;
  // One shared protective access window across checks AND explanation requests.
  const checkAccess = createMetaAccessChecker(config, dependencies.budget ? undefined : new DurableAccessWindow());
  // Provider credits, not an app-wide lifetime cap, now govern availability.
  // Keep the same durable ledger; historical attempts are never reset.
  const budget = dependencies.budget ?? new DurableBudget();
  const quota = async () => {
    try { return await budget.status?.(); }
    catch { return undefined; }
  };
  const explain = createMetaExplainer(
    config,
    budget,
    dependencies.fetcher ?? fetch,
    checkAccess,
  );
  const router = Router();
  router.post("/hiring/demo-access", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (
        req.body &&
        (typeof req.body !== "object" ||
          Array.isArray(req.body) ||
          Object.keys(req.body).length)
      ) {
        throw new DemoError(
          400,
          "ACCESS_BODY_FORBIDDEN",
          "An access check accepts no prompts, financial inputs, documents, or sample data.",
        );
      }
      const result = await checkAccess(req.get("Origin"));
      req.log.info(
        { outcome: "access_allowed", providerAttemptConsumed: false },
        "HireSense access check completed; no provider request",
      );
      const currentBudget = await quota();
      if (budget.status && !currentBudget) {
        throw new DemoError(503, "BUDGET_UNAVAILABLE", "Request allowance could not be checked. No provider request was made.");
      }
      res.json(CheckHiringDemoAccessResponse.parse({
        ...result,
        ...(currentBudget ? { budget: currentBudget, model: META_MODEL } : {}),
      }));
    } catch (error) {
      const safe =
        error instanceof DemoError
          ? error
          : new DemoError(
              503,
              "ACCESS_UNAVAILABLE",
              "Access could not be checked. No Meta request was made.",
            );
      req.log.info(
        {
          code: safe.code,
          status: safe.status,
          providerAttemptConsumed: false,
          ...safe.diagnostics,
        },
        "HireSense access check rejected; no provider request",
      );
      res
        .status(safe.status)
        .json({
          code: safe.code,
          message: safe.message,
          providerAttemptConsumed: false,
          ...safe.diagnostics,
        });
    }
  });
  const respond: import("express").RequestHandler = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const response = await explain(
        req.body,
        req.get("Origin"),
        req.path === "/hiring/meta-question" ? "question" : "explanation",
      );
      // Safe evidence only: never log headers, inputs, provider bodies, access codes or credentials.
      req.log.info(
        {
          provider: response.provider,
          model: response.model,
          profileId: response.profileId,
          requestedAt: response.requestedAt,
          completedAt: response.completedAt,
          responseId: response.responseId,
          outcome: "validated_provider_response",
        },
        "Meta fixed-sample explanation completed",
      );
      const currentBudget = await quota();
      res.json({ ...response, ...(currentBudget ? { budget: currentBudget } : {}) });
    } catch (error) {
      const safe =
        error instanceof DemoError
          ? error
          : new DemoError(
              503,
              "DEMO_UNAVAILABLE",
              "The demo is unavailable. No automatic retry.",
            );
      req.log.info(
        {
          code: safe.code,
          status: safe.status,
          providerAttemptConsumed: safe.providerAttemptConsumed,
          ...safe.diagnostics,
        },
        "Meta demo request not completed",
      );
      const currentBudget = await quota();
      res
        .status(safe.status)
        .json({
          code: safe.code,
          message: safe.message,
          providerAttemptConsumed: safe.providerAttemptConsumed,
          ...safe.diagnostics,
          ...(currentBudget ? { budget: currentBudget } : {}),
        });
    }
  };
  router.post("/hiring/meta-explanation", respond);
  router.post("/hiring/meta-question", respond);
  return router;
}

export default createMetaHiringRouter();
