/**
 * 菜单路径与名称: 平台配置 -> AI 能力
 * 文件职责: 封装 AI 能力模块使用的接口访问，统一映射 capability-admin 相关 API。
 * 主要交互文件:
 * - ../hooks/useCapabilityRegistryData.ts: 使用这里的 CRUD 方法。
 * - ../../../api: 实际后端 API 出口。
 */
import { createCapability, deleteCapability, getCapabilityDetail, listCapabilities, patchCapability } from "../../../api";

export const listCapabilityRegistry = listCapabilities;
export const getCapabilityRegistryDetail = getCapabilityDetail;
export const createCapabilityRegistryItem = createCapability;
export const patchCapabilityRegistryItem = patchCapability;
export const deleteCapabilityRegistryItem = deleteCapability;
