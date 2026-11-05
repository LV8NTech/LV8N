import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, logStartupFailure } from "./logger";

describe("startup failure logging", () => {
  it("logs a safe reason without raw error details", async () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const testLogger = createLogger(sink);
    const privateMarker = "fictional-private-startup-config-7f3a91";
    const startupError = new Error(`Listener failed: ${privateMarker}`);
    startupError.stack = [
      `Error: Listener failed: ${privateMarker}`,
      "    at fictionalPrivateStartupStackFrame (/private/config.json:12:4)",
    ].join("\n");

    logStartupFailure(startupError, testLogger);
    await new Promise<void>((resolve) => testLogger.flush(resolve));

    const output = chunks.join("");
    expect(output).toContain("listener_failed_to_start");
    expect(output).not.toContain(privateMarker);
    expect(output).not.toContain("fictionalPrivateStartupStackFrame");
    expect(output).not.toContain("/private/config.json");
  });
});
