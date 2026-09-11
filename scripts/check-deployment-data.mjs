import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export function isRuntimeData(path) {
  const parts = path.replaceAll("\\", "/").split("/");
  return parts.some(part => /^(\.local-data|local-data|uploads|backups|\.wrangler)$/i.test(part))
    || parts.some(part => /^\.env(?:\.|$)/i.test(part) && part !== ".env.example")
    || /\.(?:sqlite3?|db)(?:-wal|-shm)?$|\.(?:dump|backup)$/i.test(path)
    || /^public\/.*\.(?:pdf|hwp|hwpx|docx|xlsx)$/i.test(path);
}

export async function checkDeploymentData(directory) {
  let paths;
  if (directory) {
    const root = resolve(directory);
    paths = [];
    async function walk(relative = "") {
      for (const entry of await readdir(resolve(root, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.name === "node_modules") continue;
        paths.push(path);
        if (entry.isDirectory()) await walk(path);
      }
    }
    await walk();
  } else paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const forbidden = paths.filter(isRuntimeData);
  if (forbidden.length) throw new Error(`Runtime data must not be deployed:\n${forbidden.join("\n")}`);
  console.log(`Deployment data check passed (${directory || "tracked source"})`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/check-deployment-data.mjs")) await checkDeploymentData(process.argv[2]);
