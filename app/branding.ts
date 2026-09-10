export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const BRAND_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export function normalizeSocialCaption(value: string) { return value.normalize("NFC").replace(/[\r\n\u0000]/g, " ").trim(); }
export function validSocialCaption(value: string) { return Array.from(normalizeSocialCaption(value)).length <= 20; }

export async function validBrandImage(file: File): Promise<boolean> {
  if (!BRAND_IMAGE_TYPES.includes(file.type) || !file.size || file.size > BRAND_IMAGE_MAX_BYTES) return false;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export type BrandingRow = { favicon_key: string | null; social_image_key: string | null; updated_at: number };
export function brandingUrls(row?: BrandingRow | null) {
  return {
    faviconUrl: row?.favicon_key ? `/api/settings?asset=favicon&v=${encodeURIComponent(row.favicon_key)}` : "/default-favicon.svg",
    socialImageUrl: row?.social_image_key ? `/api/settings?asset=social&v=${encodeURIComponent(row.social_image_key)}` : "/default-social-image.svg",
  };
}
