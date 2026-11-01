// Photos and voice notes are private (server/lib/files.ts): the API returns a
// storage reference ("r2:photos/12/…"), and the browser loads it through
// GET /api/xpot/files, which checks access and redirects to a short-lived
// signed URL. Values from before the move are still full https:// URLs and
// are used as they are until the migration rewrites them.

export function fileSrc(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  if (/^https?:\/\//i.test(ref)) return ref;
  return `/api/xpot/files?ref=${encodeURIComponent(ref)}`;
}

const SMALL_IMAGE_BYTES = 300 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

/**
 * A picture ready to upload: phones shoot far more than any screen here shows, and a list
 * would download all of it for each small thumbnail. A format this browser cannot decode
 * (HEIC outside Safari) goes up as it is.
 */
export async function shrinkImageForUpload(file: File, maxEdge = 1600): Promise<string> {
  if (file.size <= SMALL_IMAGE_BYTES) return readAsDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d")!;
    // JPEG has no transparency; without this a transparent PNG would turn black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return readAsDataUrl(file);
  }
}
