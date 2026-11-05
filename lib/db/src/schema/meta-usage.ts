import { pgTable, integer, bigint } from "drizzle-orm/pg-core";
// Non-financial operational metadata only. No inputs, questions or responses.
export const metaUsage = pgTable("hiresense_meta_usage", {
  id: integer("id").primaryKey(),
  used: bigint("used", { mode: "number" }).notNull().default(10),
  windowStart: bigint("window_start", { mode: "number" }).notNull().default(0),
  accessCount: integer("access_count").notNull().default(0),
});
