import { t } from "@excalidraw/excalidraw/i18n";

// raster only: no SVG, which can carry scripts
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_SIZE = 160;

// center-crops the photo to a small square, so it fits in the profile row
export const fileToAvatar = async (file: File): Promise<string> => {
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new Error(t("profile.errors.photoInvalid"));
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error(t("profile.errors.photoTooLarge"));
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(t("profile.errors.photoInvalid"));
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency: it would turn black
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const side = Math.min(bitmap.width, bitmap.height);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
};

// null when the account has Discord's default picture
export const discordPhotoToAvatar = async (
  url: string,
): Promise<string | null> => {
  if (!url.startsWith("https://cdn.discordapp.com/avatars/")) {
    return null;
  }
  // animated photos come as .gif; Discord also serves them still
  const response = await fetch(`${url.replace(/\.gif$/, ".png")}?size=256`);
  if (!response.ok) {
    throw new Error(`Discord photo: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return fileToAvatar(new File([blob], "avatar", { type: blob.type }));
};
