import { link, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 20;
const MAX_LOCK_WAIT_MS = 10_000;

export interface AccessAttemptWindow {
  consume(now: number): Promise<boolean>;
}

type WindowMetadata = { windowStartedAt: number; attempts: number };

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function recoverStaleLock(lockPath: string): Promise<boolean> {
  try {
    const original = await lstat(lockPath);
    const serializedOwner = await readFile(lockPath, "utf8");
    if (!/^[1-9]\d*\n?$/.test(serializedOwner)) return false;
    const ownerPid = Number(serializedOwner.trim());
    if (!Number.isSafeInteger(ownerPid) || processIsAlive(ownerPid)) return false;

    // Recheck both identity and contents so a replacement lock is never removed
    // based on an earlier observation.
    const current = await lstat(lockPath);
    if (current.dev !== original.dev || current.ino !== original.ino) return false;
    if ((await readFile(lockPath, "utf8")) !== serializedOwner) return false;
    await unlink(lockPath).catch(error => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    });
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
    throw error;
  }
}

/**
 * Stores only the start time and saturated attempt count for the local-demo
 * protection window. It is deliberately separate from paid-attempt evidence.
 */
export class FileAccessAttemptWindow implements AccessAttemptWindow {
  constructor(private file = resolve(
    process.env.HIRESENSE_META_ACCESS_WINDOW_FILE || resolve(process.cwd(), "../../generated-artifacts/meta-access-window.json"),
  ), private lockWaitMs = MAX_LOCK_WAIT_MS) {}

  async consume(now: number): Promise<boolean> {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid access-window clock");
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const lockPath = `${this.file}.lock`;
    const startedWaitingAt = Date.now();
    let acquired = false;
    while (!acquired) {
      const stagingPath = `${lockPath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(stagingPath, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
        try {
          // Linking a fully written staging file publishes the owner PID
          // atomically, so a shutdown cannot leave an ownerless new lock.
          await link(stagingPath, lockPath);
          acquired = true;
        } catch (error) {
          if (!isAlreadyExists(error)) throw error;
        }
      } finally {
        await unlink(stagingPath).catch(() => undefined);
      }
      if (acquired) break;
      await recoverStaleLock(lockPath);
      if (Date.now() - startedWaitingAt >= this.lockWaitMs) {
        throw new Error("Access-window lock unavailable");
      }
      if (!acquired) {
        await delay(10);
      }
    }

    const temporaryPath = `${this.file}.tmp`;
    try {
      let metadata: WindowMetadata;
      try {
        const serialized = await readFile(this.file, "utf8");
        if (serialized.length > 256) throw new Error("Invalid access-window metadata");
        const parsed: unknown = JSON.parse(serialized);
        if (!parsed || typeof parsed !== "object" ||
            Object.keys(parsed).sort().join(",") !== "attempts,windowStartedAt" ||
            !("attempts" in parsed) || !("windowStartedAt" in parsed) ||
            !Number.isSafeInteger(parsed.attempts) || Number(parsed.attempts) < 1 ||
            Number(parsed.attempts) > MAX_ATTEMPTS ||
            !Number.isSafeInteger(parsed.windowStartedAt) || Number(parsed.windowStartedAt) < 0) {
          throw new Error("Invalid access-window metadata");
        }
        metadata = {
          attempts: Number(parsed.attempts),
          windowStartedAt: Number(parsed.windowStartedAt),
        };
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        metadata = { windowStartedAt: now, attempts: 0 };
      }

      if (now - metadata.windowStartedAt >= WINDOW_MS) metadata = { windowStartedAt: now, attempts: 0 };
      if (metadata.attempts >= MAX_ATTEMPTS) return false;

      const updated = { ...metadata, attempts: metadata.attempts + 1 };
      await writeFile(temporaryPath, JSON.stringify(updated), { mode: 0o600 });
      await rename(temporaryPath, this.file);
      return true;
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    } finally {
      await unlink(lockPath);
    }
  }
}
