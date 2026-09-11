import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseBinding, PreparedDatabaseStatement, ObjectBinding } from "./runtime";

class LocalStatement implements PreparedDatabaseStatement {
  private values: SQLInputValue[] = [];
  constructor(readonly sql: string, readonly database: DatabaseSync) {}
  bind(...values: unknown[]) {
    const bound = new LocalStatement(this.sql, this.database);
    bound.values = values.map(value => value === undefined ? null : typeof value === "boolean" ? Number(value) : value as SQLInputValue);
    return bound;
  }
  async all<T>() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) as T[] }; }
  async first<T>(column?: string) {
    const row = this.database.prepare(this.sql).get(...this.values);
    return (row ? column ? row[column] : row : null) as T | null;
  }
  runNow() {
    // The shared schema uses PostgreSQL's idempotent ADD COLUMN syntax.
    const alter = this.sql.match(/^ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (\w+) (.+)$/is);
    if (alter) {
      const columns = this.database.prepare(`PRAGMA table_info(${alter[1]})`).all();
      if (columns.some(column => column.name === alter[2])) return { success: true, meta: { changes: 0 } };
    }
    const result = this.database.prepare(alter ? `ALTER TABLE ${alter[1]} ADD COLUMN ${alter[2]} ${alter[3]}` : this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  async run() { return this.runNow(); }
}

export class LocalDatabase implements DatabaseBinding {
  private readonly database: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.database = new DatabaseSync(join(directory, "chatbot.sqlite"));
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  }
  prepare(sql: string) { return new LocalStatement(sql, this.database); }
  async batch(statements: PreparedDatabaseStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => {
        if (!(statement instanceof LocalStatement) || statement.database !== this.database) throw new Error("Invalid local statement");
        return statement.runNow();
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  close() { this.database.close(); }
}

export class LocalObjects implements ObjectBinding {
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory, "objects");
    mkdirSync(this.directory, { recursive: true });
  }
  private path(key: string) { return join(this.directory, `${createHash("sha256").update(key).digest("hex")}.json`); }
  async put(key: string, stream: ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const data = Buffer.from(await new Response(stream).arrayBuffer()).toString("base64");
    const path = this.path(key), temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ data, ...options }), { flag: "wx" });
      await rename(temporary, path);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
  async get(key: string) {
    try {
      const stored = JSON.parse(await readFile(this.path(key), "utf8"));
      return { body: new Response(Buffer.from(stored.data, "base64")).body!, httpMetadata: stored.httpMetadata };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async delete(key: string) {
    try { await unlink(this.path(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

export function localEnv() {
  const directory = resolve(process.env.LOCAL_DATA_DIR || ".local-data");
  return { DB: new LocalDatabase(directory), KNOWLEDGE_FILES: new LocalObjects(directory) };
}
