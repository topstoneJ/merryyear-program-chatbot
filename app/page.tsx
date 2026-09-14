import { HomeClient } from "./home-client";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import { publicSettings, type SettingsRow } from "./public-settings";

export default async function Home() {
  try {
    const row = await (await ensureKnowledgeSchema()).prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
    return <HomeClient initialSettings={row ? publicSettings(row) : undefined} />;
  } catch {
    return <HomeClient />;
  }
}
