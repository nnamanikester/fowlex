import "server-only";

import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

import { HttpError } from "@/lib/auth/guard";

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type Kept = { bytes: Uint8Array; type: string; name: string; farmId: string };
const g = globalThis as typeof globalThis & { __fowlexUploads?: Map<string, Kept> };
/** Files kept in memory when there's no Blob store: development and the e2e suite only. */
export const localUploads = () => (g.__fowlexUploads ??= new Map());
const local = () =>
  !process.env.BLOB_READ_WRITE_TOKEN && (process.env.NODE_ENV !== "production" || process.env.UPLOADS_LOCAL === "1");

/**
 * Keeps a receipt (a photo or a PDF, up to 5 MB) in Vercel Blob under a path nobody can guess, and
 * returns its address. Without a Blob store it's kept in memory in development and tests.
 */
export async function storeUpload(farmId: string, file: unknown) {
  if (!(file instanceof File) || file.size === 0)
    throw new HttpError(400, "invalid_upload", "Choose a photo or PDF.", "file");
  if (!UPLOAD_TYPES.includes(file.type))
    throw new HttpError(400, "invalid_upload", "Attach a photo (JPEG, PNG, WebP, HEIC) or a PDF.", "file");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, "invalid_upload", "Keep it under 5 MB.", "file");
  const name = file.name.replace(/[^\w.\- ]+/g, "").slice(-80) || "receipt";
  const id = randomUUID();
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`receipts/${farmId}/${id}-${name.replace(/\s+/g, "-")}`, file, {
      access: "public",
      contentType: file.type,
    });
    return { url: blob.url, name };
  }
  if (!local()) throw new HttpError(503, "uploads_off", "Receipt uploads aren't set up yet: add the Blob store.");
  localUploads().set(id, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type, name, farmId });
  return { url: `/api/uploads/${id}`, name };
}
