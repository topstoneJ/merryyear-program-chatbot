// Derive the browser icon without modifying the original uploaded branding file.
export async function centeredFavicon(bytes: ArrayBuffer): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  return new Uint8Array(await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(32, 32, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer());
}
