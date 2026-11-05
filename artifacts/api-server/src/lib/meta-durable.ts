import { pool } from "@workspace/db";
type SqlClient = Pick<typeof pool, "query">;
async function initialize(client: SqlClient) {
  // DML only. Publish manages schema; never run DDL at application startup.
  await client.query("INSERT INTO hiresense_meta_usage (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
}
export class DurableBudget {
  constructor(private client: SqlClient = pool) {}
  async status() {
    await initialize(this.client);
    const { rows } = await this.client.query("SELECT used FROM hiresense_meta_usage WHERE id=1");
    return { used: Number(rows[0].used), total: null, remaining: null };
  }
  async reserve() {
    await initialize(this.client);
    const r = await this.client.query("UPDATE hiresense_meta_usage SET used=used+1 WHERE id=1 AND used < 9007199254740991 RETURNING used");
    return r.rowCount === 1;
  }
}
export class DurableAccessWindow {
  constructor(private client: SqlClient = pool) {}
  async consume() {
    await initialize(this.client);
    // Database time and one atomic UPDATE coordinate all workers and restarts.
    const r = await this.client.query(`UPDATE hiresense_meta_usage SET
      window_start = CASE WHEN window_start <= EXTRACT(EPOCH FROM clock_timestamp())*1000-900000 THEN EXTRACT(EPOCH FROM clock_timestamp())*1000 ELSE window_start END,
      access_count = CASE WHEN window_start <= EXTRACT(EPOCH FROM clock_timestamp())*1000-900000 THEN 1 ELSE access_count+1 END
      WHERE id=1 AND (access_count < 20 OR window_start <= EXTRACT(EPOCH FROM clock_timestamp())*1000-900000)
      RETURNING id`);
    return r.rowCount === 1;
  }
}
