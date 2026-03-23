import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_CHUNK_BYTES = 24 * 1024;

export type TaskArtifactInput = {
  kind: string;
  fileName: string;
  content: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
};

export type StoredTaskArtifact = {
  kind: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sequenceNo: number;
  sizeBytes: number;
  contentPreview: string;
  metadata: Record<string, unknown>;
};

function getRootDir() {
  return process.env.TASK_RECORDS_DIR
    ? path.resolve(process.env.TASK_RECORDS_DIR)
    : path.resolve(process.cwd(), "data/task-records");
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function splitContent(content: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of content.split("\n")) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (Buffer.byteLength(next, "utf8") > maxBytes && current.length > 0) {
      chunks.push(current);
      current = line;
      continue;
    }
    if (Buffer.byteLength(line, "utf8") > maxBytes) {
      const words = line.split(" ");
      let partial = "";
      for (const word of words) {
        const nextWord = partial.length === 0 ? word : `${partial} ${word}`;
        if (Buffer.byteLength(nextWord, "utf8") > maxBytes && partial.length > 0) {
          chunks.push(partial);
          partial = word;
        } else {
          partial = nextWord;
        }
      }
      if (partial) chunks.push(partial);
      current = "";
      continue;
    }
    current = next;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [""];
}

export async function writeTaskArtifacts(input: {
  tenantId: string;
  customerId?: string | null;
  conversationId?: string | null;
  taskId: string;
  artifacts: TaskArtifactInput[];
}) {
  const root = getRootDir();
  const dir = path.join(
    root,
    sanitizeSegment(input.tenantId),
    sanitizeSegment(input.customerId ?? "no-customer"),
    sanitizeSegment(input.conversationId ?? "no-conversation"),
    sanitizeSegment(input.taskId)
  );

  await mkdir(dir, { recursive: true });

  const stored: StoredTaskArtifact[] = [];
  for (const artifact of input.artifacts) {
    const chunks = splitContent(artifact.content, MAX_CHUNK_BYTES);
    for (const [index, chunk] of chunks.entries()) {
      const fileName =
        chunks.length === 1
          ? sanitizeSegment(artifact.fileName)
          : `${sanitizeSegment(artifact.fileName)}.part${String(index + 1).padStart(2, "0")}`;
      const filePath = path.join(dir, fileName);
      await writeFile(filePath, chunk, "utf8");
      stored.push({
        kind: artifact.kind,
        fileName,
        filePath,
        mimeType: artifact.mimeType ?? "text/plain",
        sequenceNo: index + 1,
        sizeBytes: Buffer.byteLength(chunk, "utf8"),
        contentPreview: chunk.slice(0, 280),
        metadata: artifact.metadata ?? {}
      });
    }
  }

  const manifestPath = path.join(dir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        tenantId: input.tenantId,
        customerId: input.customerId ?? null,
        conversationId: input.conversationId ?? null,
        taskId: input.taskId,
        artifacts: stored.map((item) => ({
          kind: item.kind,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sequenceNo: item.sequenceNo,
          sizeBytes: item.sizeBytes
        }))
      },
      null,
      2
    ),
    "utf8"
  );

  return { dir, stored };
}
