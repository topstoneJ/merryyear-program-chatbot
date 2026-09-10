import { runtimeEnv } from "./runtime";

export function getDb() {
  const DB = runtimeEnv().DB;
  if (!DB) throw new Error("DATABASE_URL is not configured");
  return DB;
}
