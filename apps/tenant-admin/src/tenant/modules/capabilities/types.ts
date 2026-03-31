/**
 * 菜单路径与名称: 平台配置 -> AI 能力
 * 文件职责: 定义 AI 能力模块使用的类型别名，聚焦能力定义，不承载连接器细节。
 * 主要交互文件:
 * - ./hooks/useCapabilityRegistryData.ts: 使用列表与详情类型。
 * - ./modals/CapabilityEditModal.tsx: 使用提交入参类型。
 * - ../../types: 提供底层 Capability 类型定义。
 */
import type { CapabilityDetail, CapabilityListItem } from "../../types";

export type CapabilityRegistryItem = CapabilityListItem;
export type CapabilityRegistryDetail = CapabilityDetail;
export type CapabilityRegistryInput = import("../../types").CapabilityUpsertInput;
