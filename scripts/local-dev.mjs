import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadLocalSettings } from "./local-settings.mjs";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(project);
if (process.env.WEBSITE_INSTANCE_ID) throw new Error("Local launcher cannot run on Azure");
// Local settings live together with local data and are not part of the build.
const dataDirectory = resolve(process.env.LOCAL_DATA_DIR || ".local-data");
const settingsFile = join(dataDirectory, "settings.json");
const { settings, created } = await loadLocalSettings(dataDirectory);
const env = { ...process.env, ...settings, DATA_BACKEND: "local", LOCAL_DATA_DIR: dataDirectory, SITE_URL: "http://localhost:3000" };
for (const key of ["DATABASE_URL", "AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_ACCOUNT_NAME", "ADMIN_BOOTSTRAP_REVISION"]) delete env[key];
console.log(`Local data: ${dataDirectory}`);
console.log(`Local administrator settings: ${settingsFile}`);
console.log(created
  ? "A unique initial administrator password was generated. Read the local settings file and change it after signing in."
  : "Existing administrator credentials are unchanged. Replace any old shared password in the administrator settings.");
const child = spawn(process.execPath, [join(project, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], { cwd: project, env, stdio: "inherit" });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
