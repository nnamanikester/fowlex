"use client";

import type { AuthError } from "@/lib/auth/client";

/**
 * Shrinks a phone photo before it's sent: at most 1,600 px on the long side, as a JPEG. A 4 MB
 * camera photo becomes a few hundred KB, which matters on mobile data. PDFs, and images the browser
 * can't draw (HEIC on most), are sent as they are.
 */
export async function shrinkImage(file: File, max = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Sends a receipt to the server and returns where it's kept. Errors are shaped like the API's. */
export async function uploadReceipt(file: File): Promise<{ url: string; name: string }> {
  const body = new FormData();
  body.set("file", await shrinkImage(file));
  let response: Response;
  try {
    response = await fetch("/api/uploads", { method: "POST", body });
  } catch {
    throw { status: 0, code: "network", message: "The receipt didn't upload: no connection." } satisfies AuthError;
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw {
      status: response.status,
      code: json?.error?.code ?? "unknown",
      message: json?.error?.message ?? "The receipt didn't upload. Try again.",
    } satisfies AuthError;
  return json;
}
