import { mkdir, open, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/** Non-financial attempt counter. A failed/aborted provider attempt still consumes quota. */
export class FileAttemptBudget {
  constructor(
    private file = resolve(process.cwd(), "../../generated-artifacts/meta-demo-budget.json"),
    private maximum: number | null = 1,
  ) {}

  /** Read-only metadata; never creates, clears or replenishes the ledger. */
  async status() {
    let used = 0;
    try {
      const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (!data || typeof data !== "object" || !("attempts" in data) ||
          !Number.isSafeInteger(data.attempts) || Number(data.attempts) < 0) {
        throw new Error("Invalid attempt ledger");
      }
      used = Number(data.attempts);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    return { total: this.maximum, used, remaining: this.maximum === null ? null : Math.max(0, this.maximum - used) };
  }

  async reserve(): Promise<boolean> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const lock = await open(`${this.file}.lock`, "wx", 0o600);
    try {
      let attempts = 0;
      try {
        const data: unknown = JSON.parse(await readFile(this.file, "utf8"));
        if (!data || typeof data !== "object" || !("attempts" in data) ||
            !Number.isSafeInteger(data.attempts) || Number(data.attempts) < 0) {
          throw new Error("Invalid attempt ledger");
        }
        attempts = Number(data.attempts);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      if (this.maximum !== null && attempts >= this.maximum) return false;
      if (attempts >= Number.MAX_SAFE_INTEGER) throw new Error("Attempt ledger capacity reached");
      await writeFile(`${this.file}.tmp`, JSON.stringify({ attempts: attempts + 1 }), { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
      return true;
    } finally {
      await lock.close();
      await unlink(`${this.file}.lock`);
    }
  }
}
