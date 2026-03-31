/**
 * WhatsApp Media Download Service
 *
 * Standard WhatsApp Business API media flow:
 *  1. Webhook delivers message with `mediaId` (not a direct URL)
 *  2. GET /v{version}/{mediaId}  →  { url, mime_type, file_size, ... }
 *  3. GET {url} with Authorization header  →  binary bytes
 *  4. Save locally via saveUploadedFile() → "/uploads/{uuid}.ext"
 *
 * After resolution the attachment gets a local `url` and the `mediaId` is
 * kept for audit purposes.  If the download fails (token not configured,
 * Meta API error, etc.) the attachment is left unchanged so the message
 * can still be stored with degraded quality rather than dropped.
 */

import type { UnifiedAttachment } from "../../../../shared/types/unified-message.js";
import { saveUploadedFile, isAllowedMimeType } from "../../../../infra/storage/upload.service.js";

type MediaResolveConfig = {
  accessToken: string;
  graphApiVersion: string; // e.g. "v21.0"
};

type MetaMediaResponse = {
  url?: string;
  mime_type?: string;
  file_size?: number;
  sha256?: string;
  id?: string;
};

/**
 * Download a single WhatsApp media item and save it to local storage.
 * Returns the updated attachment with `url` set to the local path.
 */
async function downloadAndSaveMedia(
  attachment: UnifiedAttachment,
  config: MediaResolveConfig
): Promise<UnifiedAttachment> {
  const { accessToken, graphApiVersion } = config;
  const { mediaId, mimeType, fileName } = attachment;

  if (!mediaId) return attachment;

  // Step 1 — resolve media URL from Meta Graph API
  const metaUrl = `https://graph.facebook.com/${graphApiVersion}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!metaRes.ok) {
    const body = await metaRes.text();
    throw new Error(`WhatsApp media lookup failed for ${mediaId}: ${metaRes.status} ${body}`);
  }

  const meta = (await metaRes.json()) as MetaMediaResponse;
  if (!meta.url) {
    throw new Error(`WhatsApp media lookup returned no URL for ${mediaId}`);
  }

  // Step 2 — download actual media bytes
  const mediaRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!mediaRes.ok) {
    const body = await mediaRes.text();
    throw new Error(`WhatsApp media download failed: ${mediaRes.status} ${body}`);
  }

  const arrayBuffer = await mediaRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Step 3 — determine MIME type and save
  const resolvedMimeType = meta.mime_type ?? mimeType ?? "application/octet-stream";
  const resolvedFileName = fileName ?? buildDefaultFileName(mediaId, resolvedMimeType);

  // Skip unsupported MIME types rather than throwing — store the mediaId only
  if (!isAllowedMimeType(resolvedMimeType)) {
    console.warn(`[whatsapp-media] Skipping unsupported MIME type: ${resolvedMimeType} for mediaId ${mediaId}`);
    return attachment;
  }

  const saved = await saveUploadedFile(buffer, resolvedFileName, resolvedMimeType);

  return {
    ...attachment,
    url: saved.url,
    mimeType: saved.mimeType,
    fileName: saved.fileName
    // keep mediaId on the attachment for audit tracing
  };
}

/**
 * Resolve all attachments that have a `mediaId` but no local `url`.
 * Attachments that already have a URL are returned as-is.
 * Failed downloads are logged and the original attachment (with mediaId only)
 * is kept so the message is not lost.
 */
export async function resolveWhatsAppMediaAttachments(
  attachments: UnifiedAttachment[] | undefined,
  config: MediaResolveConfig
): Promise<UnifiedAttachment[]> {
  if (!attachments || attachments.length === 0) return attachments ?? [];

  return Promise.all(
    attachments.map(async (attachment) => {
      // Already has a local/remote URL — nothing to do
      if (attachment.url) return attachment;
      // No mediaId either — skip
      if (!attachment.mediaId) return attachment;

      try {
        return await downloadAndSaveMedia(attachment, config);
      } catch (err) {
        console.error(
          `[whatsapp-media] Failed to download mediaId=${attachment.mediaId}:`,
          err instanceof Error ? err.message : err
        );
        // Degrade gracefully — keep attachment with mediaId so record is not lost
        return attachment;
      }
    })
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultFileName(mediaId: string, mimeType: string): string {
  const ext = mimeTypeToExt(mimeType);
  return `${mediaId}${ext}`;
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/aac": ".aac",
    "audio/wav": ".wav",
    "audio/amr": ".amr",
    "application/pdf": ".pdf",
    "text/plain": ".txt"
  };
  return map[mimeType] ?? "";
}
