import type { Metadata } from "next";
import { ensureKnowledgeSchema } from "@/db/knowledge";
import { brandingUrls, type BrandingRow } from "@/app/branding";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = process.env.SITE_URL || "http://localhost:3000";
  let branding: (BrandingRow & { organization_name?: string; social_caption?: string }) | null = null;
  try { branding = await (await ensureKnowledgeSchema()).prepare("SELECT organization_name, logo_key, favicon_key, social_image_key, social_caption, updated_at FROM site_settings WHERE id = 'default'").first<BrandingRow & { organization_name?: string; social_caption?: string }>() || null; }
  catch { /* Preserve existing images if settings are temporarily unavailable. */ }
  const images = brandingUrls(branding);
  const title = `${branding?.organization_name?.trim() || "기관명 미설정"} 사업 안내 챗봇`;
  const description = branding?.social_caption?.trim() || "등록된 사업 안내자료를 근거로 질문에 답변합니다.";
  const socialImage = `${origin}${images.socialImageUrl}`;

  return {
    title,
    description,
    icons: {
      icon: [{ url: images.faviconUrl }],
      shortcut: images.faviconUrl,
      apple: [{ url: images.faviconUrl }],
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
