import { brandingUrls } from "@/app/branding";
import { configuredGeminiApiKeyStatus } from "@/db/knowledge";
import { DEFAULT_PRIVACY_POLICY } from "@/app/privacy-policy";

export type SettingsRow = {
  organization_name: string; contact: string; logo_key: string | null; main_headline: string;
  main_subcopy: string; chatbot_greeting: string; chat_placeholder: string; primary_color: string; updated_at: number;
  gemini_api_key_encrypted: string | null;
  favicon_key: string | null; social_image_key: string | null;
  social_caption: string;
  secondary_color: string;
  privacy_policy?: string;
};

export function publicSettings(row: SettingsRow) {
  return {
    ...brandingUrls(row),
    socialCaption: row.social_caption || "",
    organizationName: row.organization_name,
    contact: row.contact,
    logoUrl: row.logo_key ? `/api/settings?logo=${row.updated_at}` : "/default-organization-logo.svg",
    mainHeadline: row.main_headline,
    mainSubcopy: row.main_subcopy,
    chatbotGreeting: row.chatbot_greeting,
    privacyPolicy: row.privacy_policy?.trim() || DEFAULT_PRIVACY_POLICY,
    chatPlaceholder: row.chat_placeholder ?? "선택한 사업에 대해 질문해 주세요",
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color || "#808080",
    apiKeyConfigured: configuredGeminiApiKeyStatus(row.gemini_api_key_encrypted).apiKeyConfigured,
    updatedAt: row.updated_at,
  };
}
