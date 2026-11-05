import pino, { type DestinationStream } from "pino";

const isProduction = process.env.NODE_ENV === "production";

export function createLogger(destination?: DestinationStream) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      // Redact the complete header/body objects if they are ever attached to a log.
      redact: [
        "headers",
        "req.headers",
        "req.raw.headers",
        "req.body",
        "req.raw.body",
        "res.headers",
      ],
      ...(!destination && !isProduction
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true },
            },
          }
        : {}),
    },
    destination,
  );
}

export const logger = createLogger();

export function logStartupFailure(
  _error: unknown,
  targetLogger: typeof logger = logger,
) {
  targetLogger.error(
    { reason: "listener_failed_to_start" },
    "Error listening on port",
  );
}
