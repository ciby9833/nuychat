// 作用：定义统一 structured 消息协议，供消息入库、渠道出站和前端渲染共用。
// 功能：消息中心 / AI 回复 / 技能脚本结果结构化输出

export type StructuredMessageField = {
  label: string;
  value: string;
};

export type StructuredMessageRecord = {
  title?: string;
  fields: StructuredMessageField[];
};

export type StructuredMessageAction = {
  type?: "button" | "list" | "postback";
  label: string;
  value: string;
};

export type StructuredMessageBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "key_value";
      items: StructuredMessageField[];
    }
  | {
      type: "records";
      items: StructuredMessageRecord[];
    };

export type StructuredMessage = {
  version: "2026-03-28";
  blocks: StructuredMessageBlock[];
  actions?: StructuredMessageAction[];
};
