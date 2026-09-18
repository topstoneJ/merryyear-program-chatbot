import { HomeClient } from "./home-client";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import { publicSettings, type SettingsRow } from "./public-settings";

export default async function Home() {
  let initialSettings;
  try {
    const row = await (await ensureKnowledgeSchema()).prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
    initialSettings = row ? publicSettings(row) : undefined;
  } catch (error) {
    console.error("Home settings failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
  }
  return <HomeClient initialSettings={initialSettings} />;
}
