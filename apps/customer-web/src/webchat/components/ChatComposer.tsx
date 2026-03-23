import { ClipboardEvent, FormEvent, useState } from "react";
import type { WebchatAttachment } from "../types";

export function ChatComposer(props: {
  onSend: (payload: { text?: string; attachments?: WebchatAttachment[] }) => Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<WebchatAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim();
    if ((!value && files.length === 0) || props.disabled) {
      return;
    }

    await props.onSend({
      text: value || undefined,
      attachments: files.length > 0 ? files : undefined
    });
    setText("");
    setFiles([]);
  };

  const appendFiles = async (items: File[]) => {
    if (items.length === 0) return;
    const next = await Promise.all(items.slice(0, 3).map(toAttachment));
    setFiles((current) => [...current, ...(next.filter(Boolean) as WebchatAttachment[])].slice(0, 10));
  };

  const onSelectFile = async (items: FileList | null) => {
    if (!items || items.length === 0) return;
    await appendFiles(Array.from(items));
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);

    if (files.length === 0) return;
    event.preventDefault();
    void appendFiles(files);
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <form
      className={`chat-composer${dragOver ? " drag-over" : ""}`}
      onSubmit={onSubmit}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        void onSelectFile(event.dataTransfer.files);
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onPaste={onPaste}
        placeholder="输入你的问题..."
        disabled={props.disabled}
      />
      <label className="file-btn">
        +
        <input
          type="file"
          multiple
          onChange={(event) => { void onSelectFile(event.target.files); }}
          style={{ display: "none" }}
        />
      </label>
      <button type="submit" disabled={props.disabled || (!text.trim() && files.length === 0)}>
        发送
      </button>
      {files.length > 0 ? (
        <div className="composer-files">
          {files.map((file, index) => (
            <span key={`${file.name}-${index}`}>
              {file.name}
              <button type="button" onClick={() => removeFile(index)} aria-label={`移除 ${file.name}`}>✕</button>
            </span>
          ))}
        </div>
      ) : null}
    </form>
  );
}

async function toAttachment(file: File): Promise<WebchatAttachment | null> {
  if (file.size > 2 * 1024 * 1024) return null;
  const dataUrl = await readAsDataUrl(file);
  return {
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    dataUrl
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}
