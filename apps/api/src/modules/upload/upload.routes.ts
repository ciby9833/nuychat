import type { FastifyInstance } from "fastify";

import { isAllowedMimeType, saveUploadedFile } from "../../infra/storage/upload.service.js";

export async function uploadRoutes(app: FastifyInstance) {
  /**
   * POST /api/upload
   * Content-Type: multipart/form-data
   * Field: file (binary)
   *
   * Requires tenant auth (tenantContextPlugin preHandler).
   * Returns: { url, mimeType, fileName, fileSize }
   */
  app.post("/api/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      throw app.httpErrors.badRequest("No file uploaded");
    }

    const mimeType = file.mimetype ?? "application/octet-stream";
    if (!isAllowedMimeType(mimeType)) {
      throw app.httpErrors.badRequest(`File type ${mimeType} is not allowed`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (file.file.truncated) {
      throw (app.httpErrors as any).requestEntityTooLarge("File too large (max 10 MB)");
    }

    const result = await saveUploadedFile(buffer, file.filename, mimeType);

    return reply.code(201).send(result);
  });
}
