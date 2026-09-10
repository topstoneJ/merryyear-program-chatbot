// Compose the supplied logo without redrawing its lettering or changing its ratio.
export async function createDefaultSocialImage(): Promise<File> {
  const image = new Image();
  image.src = "/default-organization-logo.svg";
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 생성하지 못했습니다. 다시 시도해 주세요.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(900 / image.naturalWidth, 360 / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, (1200 - width) / 2, (630 - height) / 2, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("이미지를 생성하지 못했습니다.")), "image/png"));
  return new File([blob], "기관-기본-썸네일.png", { type: "image/png" });
}
