import { expect, it } from "vitest";
import { pool } from "@workspace/db";
import { DurableAccessWindow, DurableBudget } from "./meta-durable";

it("retains usage across instances and bounds access atomically in a temporary database fixture", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE hiresense_meta_usage (LIKE public.hiresense_meta_usage INCLUDING ALL) ON COMMIT DROP");
    const b = new DurableBudget(client);
    expect((await b.status()).used).toBe(10);
    await b.reserve();
    expect(await new DurableBudget(client).status()).toEqual({ used: 11, total: null, remaining: null });
    const results = await Promise.all(Array.from({ length: 25 }, () => new DurableAccessWindow(client).consume()));
    expect(results.filter(Boolean)).toHaveLength(20);
    expect((await b.status()).used).toBe(11);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
