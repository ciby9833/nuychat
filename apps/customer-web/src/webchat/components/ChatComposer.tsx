import { FormEvent, useState } from "react";
import type { WebchatAttachment } from "../types";

export function ChatComposer(props: {
  onSend: (payload: { text?: string; attachments?: WebchatAttachment[] }) => Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<WebchatAttachment[]>([]);

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

  const onSelectFile = async (items: FileList | null) => {
    if (!items || items.length === 0) return;
    const next = await Promise.all(Array.from(items).slice(0, 3).map(toAttachment));
    setFiles(next.filter(Boolean) as WebchatAttachment[]);
  };

  return (
    <form className="chat-composer" onSubmit={onSubmit}>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
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
          {files.map((file) => (
            <span key={file.name}>{file.name}</span>
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
