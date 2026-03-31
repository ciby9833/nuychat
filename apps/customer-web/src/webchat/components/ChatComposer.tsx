import { ClipboardEvent, FormEvent, useState } from "react";

export function ChatComposer(props: {
  onSend: (payload: { text?: string; attachments?: File[] }) => Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
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
    setFiles((current) => [...current, ...items].slice(0, 10));
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
