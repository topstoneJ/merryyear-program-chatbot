import type { Metadata } from "next";
import { knowledgeEnv } from "@/db/knowledge";
import { brandingUrls, type BrandingRow } from "@/app/branding";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = "https://business-guide-chatbot-v4.csmerry.chatgpt.site";
  let branding: (BrandingRow & { social_caption?: string }) | null = null;
  try { branding = await knowledgeEnv().DB?.prepare("SELECT favicon_key, social_image_key, social_caption, updated_at FROM site_settings WHERE id = 'default'").first<BrandingRow & { social_caption?: string }>() || null; }
  catch { /* Preserve existing images if settings are temporarily unavailable. */ }
  const images = brandingUrls(branding);
  const title = "열매나눔재단 사업 안내 챗봇";
  const description = branding?.social_caption?.trim() || "사회적기업 시설·운영비와 위기아동가정 지원사업을 공고문 근거로 안내합니다.";
  const socialImage = `${origin}${images.socialImageUrl}`;

  return {
    title,
    description,
    icons: {
      icon: branding?.favicon_key ? [{ url: images.faviconUrl }] : [
        { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
        { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      ],
      shortcut: images.faviconUrl,
      apple: branding?.favicon_key ? [{ url: images.faviconUrl }] : [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head><link rel="stylesheet" href="/fonts/noto-sans-kr/style.css" /></head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
