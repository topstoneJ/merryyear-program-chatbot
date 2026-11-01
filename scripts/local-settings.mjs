import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export async function loadLocalSettings(dataDirectory) {
  await mkdir(dataDirectory, { recursive: true });
  const settingsFile = join(dataDirectory, "settings.json");
  try {
    return { settings: JSON.parse(await readFile(settingsFile, "utf8")), created: false };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const settings = {
    ADMIN_ID: "administrator",
    ADMIN_PASSWORD: `${randomBytes(12).toString("base64url")}Aa!1`,
    ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
    API_KEY_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
  };
  try {
    await writeFile(settingsFile, JSON.stringify(settings, null, 2), { flag: "wx", mode: 0o600 });
    return { settings, created: true };
  } catch (error) {
    // Two launches may race; never overwrite credentials already persisted by the first.
    if (error.code !== "EEXIST") throw error;
    return { settings: JSON.parse(await readFile(settingsFile, "utf8")), created: false };
  }
}
