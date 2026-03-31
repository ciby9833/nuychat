// 作用：客户 web 渠道渲染 structured 消息。
// 页面：客户 webchat / 消息列表

type StructuredMessageField = {
  label: string;
  value: string;
};

type StructuredMessageRecord = {
  title?: string;
  fields: StructuredMessageField[];
};

type StructuredMessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "key_value"; items: StructuredMessageField[] }
  | { type: "records"; items: StructuredMessageRecord[] };

type StructuredMessage = {
  version: "2026-03-28";
  blocks: StructuredMessageBlock[];
};

export function StructuredMessageContent(props: {
  structured?: StructuredMessage | null;
  fallbackText?: string;
}) {
  const blocks = Array.isArray(props.structured?.blocks) ? props.structured.blocks : [];
  if (blocks.length === 0) {
    return <p>{props.fallbackText || "[非文本消息]"}</p>;
  }

  return (
    <div className="structured-message">
      {blocks.map((block, index) => {
        if (block.type === "paragraph") {
          return <p key={`${block.type}-${index}`}>{block.text}</p>;
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}
            </ListTag>
          );
        }
        if (block.type === "key_value") {
          return (
            <div key={`${block.type}-${index}`} className="structured-kv">
              {block.items.map((item, itemIndex) => (
                <div key={`${item.label}-${itemIndex}`} className="structured-kv-row">
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={`${block.type}-${index}`} className="structured-records">
            {block.items.map((record, recordIndex) => (
              <div key={`${record.title ?? "record"}-${recordIndex}`} className="structured-record">
                {record.title ? <strong>{record.title}</strong> : null}
                {record.fields.map((field, fieldIndex) => (
                  <div key={`${field.label}-${fieldIndex}`} className="structured-kv-row">
                    <strong>{field.label}</strong>
                    <span>{field.value}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
