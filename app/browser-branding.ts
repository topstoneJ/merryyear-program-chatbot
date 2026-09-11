"use client";

export type BrowserBranding = { organizationName: string; faviconUrl: string };

export function browserTabTitle(organizationName: string) {
  return `${organizationName.trim() || "기관명 미설정"} 사업 안내 챗봇`;
}

export function syncBrowserBranding(branding: BrowserBranding, target: Document = document) {
  target.title = browserTabTitle(branding.organizationName);
  target.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => {
    link.href = branding.faviconUrl;
    link.removeAttribute("sizes");
    link.removeAttribute("type");
  });
}
