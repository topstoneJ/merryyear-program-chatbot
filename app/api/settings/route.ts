import { encryptConfiguredGeminiApiKey, ensureKnowledgeSchema, knowledgeEnv } from "@/db/knowledge";
import { requireAdminApi } from "@/app/admin-session";
import { validBrandImage, normalizeSocialCaption, validSocialCaption } from "@/app/branding";
import { centeredFavicon } from "@/app/favicon-image";
import { publicSettings, type SettingsRow } from "@/app/public-settings";

function clean(value: FormDataEntryValue | null, limit: number) {
  return String(value || "").replace(/\u0000/g, "").trim().slice(0, limit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const DB = await ensureKnowledgeSchema();
  const row = await DB.prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
  if (!row) return Response.json({ error: "설정을 찾을 수 없습니다." }, { status: 404 });
  if (url.searchParams.has("logo") || url.searchParams.has("asset")) {
    const asset = url.searchParams.get("asset");
    const isFavicon = !url.searchParams.has("logo") && asset === "favicon";
    const key = url.searchParams.has("logo") ? row.logo_key : isFavicon ? row.favicon_key || row.logo_key : asset === "social" ? row.social_image_key : null;
    if (!key) return new Response(null, { status: 404 });
    const object = await knowledgeEnv().KNOWLEDGE_FILES?.get(key);
    if (!object) return new Response(null, { status: 404 });
    if (isFavicon) {
      try {
        const icon = await centeredFavicon(await new Response(object.body).arrayBuffer());
        return new Response(icon as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
      } catch {
        return Response.redirect(new URL("/default-favicon.svg", request.url), 302);
      }
    }
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/png", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  }
  return Response.json({ settings: publicSettings(row) });
}

export async function PATCH(request: Request) {
  const denied = await requireAdminApi({ settings: true });
  if (denied) return denied;
  try {
    const form = await request.formData();
    const captionValue = form.has("socialCaption") ? normalizeSocialCaption(String(form.get("socialCaption") || "")) : null;
    if (captionValue !== null && !validSocialCaption(captionValue)) return Response.json({ error: "썸네일 문구는 20자 이하로 입력해 주세요." }, { status: 400 });
    if (form.get("action") === "social-image-only") {
      const file = form.get("socialImage");
      if (!(file instanceof File) || !(await validBrandImage(file))) return Response.json({ error: "3MB 이하의 PNG·JPG·WEBP 이미지를 선택해 주세요." }, { status: 400 });
      const DB = await ensureKnowledgeSchema();
      const previous = await DB.prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
      if (!previous) return Response.json({ error: "설정을 찾을 수 없습니다." }, { status: 404 });
      const bucket = knowledgeEnv().KNOWLEDGE_FILES;
      if (!bucket) throw new Error("Brand image storage unavailable");
      const key = `branding/social-${crypto.randomUUID()}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      const updatedAt = Date.now();
      const caption = captionValue ?? previous.social_caption ?? "";
      await DB.prepare("UPDATE site_settings SET social_image_key = ?, updated_at = ?, social_caption = ? WHERE id = 'default'").bind(key, updatedAt, caption).run();
      return Response.json({ settings: publicSettings({ ...previous, social_image_key: key, updated_at: updatedAt, social_caption: caption }) });
    }
    const organizationName = clean(form.get("organizationName"), 100);
    const contact = clean(form.get("contact"), 200);
    const mainHeadline = clean(form.get("mainHeadline"), 180);
    const mainSubcopy = clean(form.get("mainSubcopy"), 300);
    const chatbotGreeting = clean(form.get("chatbotGreeting"), 500);
    const primaryColor = clean(form.get("primaryColor"), 7);
    const secondaryColor = form.has("secondaryColor") ? clean(form.get("secondaryColor"), 7) : null;
    const apiKey = clean(form.get("apiKey"), 300);
    if (!organizationName || !mainHeadline || !mainSubcopy || !chatbotGreeting || !/^#[0-9a-f]{6}$/i.test(primaryColor) || (secondaryColor !== null && !/^#[0-9a-f]{6}$/i.test(secondaryColor))) {
      return Response.json({ error: "입력 내용을 확인해 주세요." }, { status: 400 });
    }
    const DB = await ensureKnowledgeSchema();
    const previous = await DB.prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
    const chatPlaceholder = form.has("chatPlaceholder") ? clean(form.get("chatPlaceholder"), 150) : previous?.chat_placeholder ?? "선택한 사업에 대해 질문해 주세요";
    const favicon = form.get("favicon");
    const socialImage = form.get("socialImage");
    for (const file of [favicon, socialImage]) {
      if (file instanceof File && file.size && !(await validBrandImage(file))) return Response.json({ error: "탭 아이콘과 링크 공유 썸네일은 3MB 이하의 PNG·JPG·WEBP 이미지 파일만 가능합니다." }, { status: 400 });
    }
    let faviconKey = previous?.favicon_key || null;
    let socialImageKey = previous?.social_image_key || null;
    let logoKey = previous?.logo_key || null;
    const logo = form.get("logo");
    if (logo instanceof File && logo.size) {
      if (!(await validBrandImage(logo))) return Response.json({ error: "로고는 3MB 이하 PNG·JPG·WEBP 이미지 파일만 가능합니다." }, { status: 400 });
      logoKey = `branding/logo-${Date.now()}`;
      const bucket = knowledgeEnv().KNOWLEDGE_FILES;
      if (!bucket) throw new Error("Logo storage unavailable");
      await bucket.put(logoKey, logo.stream(), { httpMetadata: { contentType: logo.type } });
    }
    const bucket = knowledgeEnv().KNOWLEDGE_FILES;
    for (const [kind, file] of [["favicon", favicon], ["social", socialImage]] as const) {
      if (!(file instanceof File) || !file.size) continue;
      if (!bucket) throw new Error("Brand image storage unavailable");
      const key = `branding/${kind}-${crypto.randomUUID()}`;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      if (kind === "favicon") faviconKey = key; else socialImageKey = key;
    }
    const updatedAt = Date.now();
    const encryptedApiKey = apiKey ? await encryptConfiguredGeminiApiKey(apiKey) : previous?.gemini_api_key_encrypted || null;
    await DB.prepare(`UPDATE site_settings SET organization_name = ?, contact = ?, logo_key = ?, main_headline = ?, main_subcopy = ?, chatbot_greeting = ?, primary_color = ?, gemini_api_key_encrypted = ?, updated_at = ?, favicon_key = ?, social_image_key = ?, social_caption = ?, chat_placeholder = ?, secondary_color = ? WHERE id = 'default'`)
      .bind(organizationName, contact, logoKey, mainHeadline, mainSubcopy, chatbotGreeting, primaryColor, encryptedApiKey, updatedAt, faviconKey, socialImageKey, captionValue ?? previous?.social_caption ?? "", chatPlaceholder, secondaryColor ?? previous?.secondary_color ?? "#808080").run();
    const row = await DB.prepare("SELECT * FROM site_settings WHERE id = 'default'").first<SettingsRow>();
    return Response.json({ settings: row ? publicSettings(row) : null });
  } catch (error) {
    console.error("Settings update failed", { requestId: crypto.randomUUID(), kind: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 });
  }
}
