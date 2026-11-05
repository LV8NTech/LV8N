import express, { type Express, type Router } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import type { Logger } from "pino";

export function createApp(
  options: { logger?: Logger; router?: Router } = {},
): Express {
  const app: Express = express();
  app.use((_req, res, next) => {
    res.setHeader("X-HireSense-Service", "preview-no-code-v1");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(
    pinoHttp({
      logger: options.logger ?? logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    }),
  );
  app.use(cors());
  // Bounded custom inputs and snapshot identifiers fit without unbounded bodies.
  app.use("/api/hiring/meta-explanation", express.json({ limit: "32kb", inflate: false }));
  app.use("/api/hiring/meta-question", express.json({ limit: "32kb", inflate: false }));
  app.use(express.json({ limit: "2kb", inflate: false }));
  app.use(express.urlencoded({ extended: true, limit: "2kb", inflate: false }));

  app.use("/api", options.router ?? router);

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const tooLarge =
        !!error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "entity.too.large";
      res
        .status(tooLarge ? 413 : 400)
        .json({
          code: "INVALID_REQUEST",
          message: "Send only the supported small JSON request.",
          providerAttemptConsumed: false,
        });
    },
  );

  return app;
}

const app = createApp();
export default app;
