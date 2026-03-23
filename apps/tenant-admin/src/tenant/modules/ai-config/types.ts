// 作用: AI 配置管理模块的类型定义与辅助函数
// 菜单路径: 客户中心 -> AI 配置管理
// 作者：吴川

import { getSharedAIProviderOption, type SharedAIProvider } from "../../../../../../packages/shared-types/src/ai-model-config";

export type ProviderOption = SharedAIProvider;

export type ConfigDrawerMode = "create" | "view" | "edit";

export type AIConfigFormValues = {
  name: string;
  provider: ProviderOption;
  model_name: string;
  base_url?: string | null;
  temperature: number;
  max_tokens: number;
  system_prompt_override: string | null;
  is_active: boolean;
};

export function normalizeProvider(input: string): ProviderOption {
  return getSharedAIProviderOption(input).value;
}
