import { PaperClipOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";
import { Sender } from "@ant-design/x";
import type { ClipboardEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useRef, useState } from "react";

import type { WebchatMessage } from "../types";

function isSelfMessage(message: WebchatMessage) {
  if (message.sender_type === "customer") return true;
  if (message.sender_type === "agent" || message.sender_type === "bot" || message.sender_type === "system") return false;
  return message.direction === "inbound";
}

export function ChatComposer(props: {
  onSend: (payload: {
    text?: string;
    attachments?: File[];
    replyToMessageId?: string;
    reactionEmoji?: string;
    reactionToMessageId?: string;
  }) => Promise<void>;
  disabled: boolean;
  replyTarget: WebchatMessage | null;
  onCancelReply: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const replyPreview = props.replyTarget
    ? props.replyTarget.text.trim()
      || props.replyTarget.attachments?.[0]?.name
      || "附件消息"
    : "";

  const appendFiles = (items: File[]) => {
    if (items.length === 0) return;
    setFiles((current) => [...current, ...items].slice(0, 10));
  };

  const submit = async () => {
    const value = text.trim();
    if ((!value && files.length === 0) || props.disabled) return;

    await props.onSend({
      text: value || undefined,
      attachments: files.length > 0 ? files : undefined,
      replyToMessageId: props.replyTarget?.id ?? undefined
    });
    setText("");
    setFiles([]);
  };

  return (
    <div className="chat-composer-shell">
      {props.replyTarget ? (
        <div className="composer-reply-banner">
          <div>
            <strong>{isSelfMessage(props.replyTarget) ? "回复你自己" : "回复客服"}</strong>
            <p>{replyPreview}</p>
          </div>
          <Button type="text" onClick={props.onCancelReply}>取消</Button>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="composer-files">
          {files.map((file, index) => (
            <Tag
              key={`${file.name}-${index}`}
              closable
              onClose={(event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>) => {
                event.preventDefault();
                setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
              }}
            >
              {file.name}
            </Tag>
          ))}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          appendFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <Sender
        value={text}
        onChange={(value: string) => setText(value)}
        onSubmit={() => {
          void submit();
        }}
        onPaste={(event: ClipboardEvent<HTMLElement>) => {
          const pastedFiles = Array.from(event.clipboardData.items)
            .filter((item: DataTransferItem) => item.kind === "file")
            .map((item: DataTransferItem) => item.getAsFile())
            .filter((file): file is File => file instanceof File);
          if (pastedFiles.length === 0) return;
          event.preventDefault();
          appendFiles(pastedFiles);
        }}
        disabled={props.disabled}
        loading={props.disabled}
        placeholder="输入你的问题..."
        autoSize={{ minRows: 1, maxRows: 6 }}
        prefix={(
          <Button
            type="text"
            className="composer-upload-btn"
            icon={<PaperClipOutlined />}
            onClick={() => inputRef.current?.click()}
          />
        )}
      />
    </div>
  );
}
