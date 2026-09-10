import { ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { Readable } from "node:stream";
import { Pool, types, type PoolClient, type QueryResult } from "pg";

types.setTypeParser(20, (value) => Number(value));

export type DatabaseRunResult = { success: boolean; meta: { changes: number } };
export type DatabaseAllResult<T> = { success: boolean; results: T[] };

export interface PreparedDatabaseStatement {
  bind(...values: unknown[]): PreparedDatabaseStatement;
  all<T = Record<string, unknown>>(): Promise<DatabaseAllResult<T>>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<DatabaseRunResult>;
}

export interface DatabaseBinding {
  prepare(sql: string): PreparedDatabaseStatement;
  batch(statements: PreparedDatabaseStatement[]): Promise<DatabaseRunResult[]>;
}

export interface ObjectBinding {
  put(key: string, value: ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

function postgresSql(sql: string) {
  const pragma = sql.trim().match(/^PRAGMA\s+table_info\(([^)]+)\)$/i);
  if (pragma) {
    return {
      sql: "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
      prefixValues: [pragma[1].replace(/[\"'`]/g, "")],
    };
  }

  sql = sql.replace(/instr\(([^,]+),\s*('[^']*')\)/gi, "POSITION($2 IN $1)");

  let quote: "'" | '"' | null = null;
  let index = 0;
  let converted = "";
  for (const character of sql) {
    if ((character === "'" || character === '"') && quote === character) quote = null;
    else if ((character === "'" || character === '"') && quote === null) quote = character;
    if (character === "?" && quote === null) converted += `$${++index}`;
    else converted += character;
  }
  const ignoresConflicts = /^\s*INSERT\s+OR\s+IGNORE\s+/i.test(converted);
  if (ignoresConflicts) {
    converted = converted.replace(/^\s*INSERT\s+OR\s+IGNORE\s+/i, "INSERT ").trimEnd();
    converted += " ON CONFLICT DO NOTHING";
  }
  return { sql: converted, prefixValues: [] as unknown[] };
}

class PostgresStatement implements PreparedDatabaseStatement {
  values: unknown[] = [];
  constructor(readonly sourceSql: string, private readonly pool: Pool, private readonly client?: PoolClient) {}

  bind(...values: unknown[]) {
    const statement = new PostgresStatement(this.sourceSql, this.pool, this.client);
    statement.values = values;
    return statement;
  }

  private query(): Promise<QueryResult> {
    const converted = postgresSql(this.sourceSql);
    return (this.client ?? this.pool).query(converted.sql, [...converted.prefixValues, ...this.values]);
  }

  async all<T>() {
    const result = await this.query();
    return { success: true, results: result.rows as T[] };
  }

  async first<T>(column?: string) {
    const result = await this.query();
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    if (!column) return row as T;
    const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === column.toLowerCase())
      ?? (column === "COUNT(*)" ? Object.keys(row).find((candidate) => candidate.toLowerCase() === "count") : undefined);
    return (key ? row[key] : null) as T | null;
  }

  async run() {
    const result = await this.query();
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }
}

class PostgresDatabase implements DatabaseBinding {
  constructor(private readonly pool: Pool) {}
  prepare(sql: string) { return new PostgresStatement(sql, this.pool); }

  async batch(statements: PreparedDatabaseStatement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: DatabaseRunResult[] = [];
      for (const statement of statements) {
        if (!(statement instanceof PostgresStatement)) throw new Error("Unsupported database statement");
        const transactional = new PostgresStatement(statement.sourceSql, this.pool, client).bind(...statement.values);
        results.push(await transactional.run());
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

class AzureBlobBinding implements ObjectBinding {
  private containerPromise?: Promise<unknown>;
  constructor(private readonly container = blobContainer()) {}

  private async ready() {
    this.containerPromise ??= this.container.createIfNotExists();
    await this.containerPromise;
    return this.container;
  }

  async put(key: string, value: ReadableStream<Uint8Array>, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const container = await this.ready();
    const bytes = Buffer.from(await new Response(value).arrayBuffer());
    await container.getBlockBlobClient(key).uploadData(bytes, {
      blobHTTPHeaders: { blobContentType: options?.httpMetadata?.contentType },
      metadata: options?.customMetadata,
    });
  }

  async get(key: string) {
    const container = await this.ready();
    try {
      const response = await container.getBlobClient(key).download();
      if (!response.readableStreamBody) return null;
      return {
        body: Readable.toWeb(response.readableStreamBody as Readable) as ReadableStream<Uint8Array>,
        httpMetadata: { contentType: response.contentType },
      };
    } catch (error) {
      if (typeof error === "object" && error && "statusCode" in error && error.statusCode === 404) return null;
      throw error;
    }
  }

  async delete(key: string) {
    const container = await this.ready();
    await container.deleteBlob(key, { deleteSnapshots: "include" });
  }
}

function blobContainer() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "knowledge-files";
  const service = connectionString
    ? BlobServiceClient.fromConnectionString(connectionString)
    : accountName
      ? new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, new ManagedIdentityCredential())
      : null;
  if (!service) throw new Error("Azure Blob Storage is not configured");
  return service.getContainerClient(containerName);
}

const connectionString = process.env.DATABASE_URL;
const postgres = connectionString
  ? new PostgresDatabase(new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_SIZE || 5),
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: true },
    }))
  : null;
const blob = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_ACCOUNT_NAME
  ? new AzureBlobBinding()
  : null;

export function runtimeEnv() {
  return { DB: postgres, KNOWLEDGE_FILES: blob };
}
