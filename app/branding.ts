export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const BRAND_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const DEFAULT_PRIMARY_COLOR = "#f26a2e";
export const DEFAULT_SECONDARY_COLOR = "#808080";
export function brandTheme(primary = DEFAULT_PRIMARY_COLOR, secondary = DEFAULT_SECONDARY_COLOR) {
  const main = /^#[0-9a-f]{6}$/i.test(primary) ? primary : DEFAULT_PRIMARY_COLOR;
  const sub = /^#[0-9a-f]{6}$/i.test(secondary) ? secondary : DEFAULT_SECONDARY_COLOR;
  const channels = (color: string) => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const luminance = (color: string) => {
    const rgb = channels(color).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const mix = (color: string, target: "#000000" | "#ffffff", amount: number) => `#${channels(color).map((value, index) => Math.round(value * (1 - amount) + channels(target)[index] * amount).toString(16).padStart(2, "0")).join("")}`;
  const lightMain = luminance(main) > 0.45;
  const deep = mix(main, "#000000", lightMain ? 0.28 : 0.18);
  const light = mix(main, "#ffffff", 0.38);
  const wash = mix(main, "#ffffff", 0.76);
  const washSoft = mix(main, "#ffffff", 0.92);
  const foreground = (color: string) => luminance(color) > 0.179 ? "#000000" : "#ffffff";
  return { "--orange": main, "--gold": main, "--brand-deep": deep, "--brand-light": light, "--brand-wash": wash, "--brand-wash-soft": washSoft, "--brand-preview": main, "--brand-secondary": sub, "--on-primary": foreground(main), "--on-secondary": foreground(sub) };
}
export function normalizeSocialCaption(value: string) { return value.normalize("NFC").replace(/[\r\n\u0000]/g, " ").trim(); }
export function validSocialCaption(value: string) { return Array.from(normalizeSocialCaption(value)).length <= 20; }

export async function validBrandImage(file: File): Promise<boolean> {
  if (!BRAND_IMAGE_TYPES.includes(file.type) || !file.size || file.size > BRAND_IMAGE_MAX_BYTES) return false;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (file.type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
}

export type BrandingRow = { logo_key?: string | null; favicon_key: string | null; social_image_key: string | null; updated_at: number };
export function brandingUrls(row?: BrandingRow | null) {
  return {
    faviconUrl: row?.favicon_key
      ? `/api/settings?asset=favicon&v=${encodeURIComponent(row.favicon_key)}`
      : row?.logo_key
        ? `/api/settings?logo=${row.updated_at}`
        : "/default-favicon.svg",
    socialImageUrl: row?.social_image_key ? `/api/settings?asset=social&v=${encodeURIComponent(row.social_image_key)}` : "/default-social-image.svg",
  };
}
