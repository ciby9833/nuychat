import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "data/uploads");

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Allowed MIME prefixes — reject unknown types */
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "text/csv",
  "text/plain",
  "application/json",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed"
];

export function getUploadsDir(): string {
  return UPLOADS_DIR;
}

export function getMaxFileSize(): number {
  return MAX_FILE_SIZE;
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "application/pdf": ".pdf",
    "text/csv": ".csv",
    "text/plain": ".txt",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/zip": ".zip"
  };
  return map[mimeType] ?? "";
}

export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ url: string; mimeType: string; fileName: string; fileSize: number }> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size ${buffer.length} exceeds maximum ${MAX_FILE_SIZE}`);
  }

  if (!isAllowedMimeType(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed`);
  }

  await mkdir(UPLOADS_DIR, { recursive: true });

  const ext = path.extname(originalName) || mimeTypeToExt(mimeType);
  const storedName = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, storedName);

  await writeFile(filePath, buffer);

  return {
    url: `/uploads/${storedName}`,
    mimeType,
    fileName: originalName,
    fileSize: buffer.length
  };
}
