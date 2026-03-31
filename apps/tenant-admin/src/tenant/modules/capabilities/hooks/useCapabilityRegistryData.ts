/**
 * 菜单路径与名称: 平台配置 -> AI 能力
 * 文件职责: 管理 AI 能力页面的数据加载、详情切换，以及新建、更新、删除后的状态同步。
 * 主要交互文件:
 * - ../api/index.ts: 提供能力目录 CRUD 接口。
 * - ../pages/CapabilityRegistryPage.tsx: 消费本 hook 的状态与动作。
 * - ../types.ts: 提供列表、详情、提交入参类型。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createCapabilityRegistryItem,
  deleteCapabilityRegistryItem,
  getCapabilityRegistryDetail,
  listCapabilityRegistry,
  patchCapabilityRegistryItem
} from "../api";
import type { CapabilityRegistryDetail, CapabilityRegistryInput, CapabilityRegistryItem } from "../types";

export function useCapabilityRegistryData() {
  const [items, setItems] = useState<CapabilityRegistryItem[]>([]);
  const [detail, setDetail] = useState<CapabilityRegistryDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listCapabilityRegistry();
      setItems(data.items);
      return data.items;
    } catch (err) {
      setError((err as Error).message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (capabilityId: string) => {
    setDetailLoading(true);
    setError("");
    try {
      const data = await getCapabilityRegistryDetail(capabilityId);
      setSelectedId(capabilityId);
      setDetail(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const createItem = useCallback(async (input: CapabilityRegistryInput) => {
    const data = await createCapabilityRegistryItem(input);
    await loadList();
    setSelectedId(data.capabilityId);
    setDetail(data);
    return data;
  }, [loadList]);

  const updateItem = useCallback(async (capabilityId: string, input: Partial<CapabilityRegistryInput>) => {
    const data = await patchCapabilityRegistryItem(capabilityId, input);
    await loadList();
    setSelectedId(data.capabilityId);
    setDetail(data);
    return data;
  }, [loadList]);

  const deleteItem = useCallback(async (capabilityId: string) => {
    await deleteCapabilityRegistryItem(capabilityId);
    const data = await loadList();
    const next = data[0] ?? null;
    if (next) {
      await loadDetail(next.capabilityId);
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }, [loadDetail, loadList]);

  useEffect(() => {
    void (async () => {
      const data = await loadList();
      if (data.length > 0) {
        void loadDetail(data[0].capabilityId);
      }
    })();
  }, [loadDetail, loadList]);

  const selectedItem = useMemo(
    () => items.find((item) => item.capabilityId === selectedId) ?? null,
    [items, selectedId]
  );

  return {
    items,
    detail,
    selectedId,
    selectedItem,
    loading,
    detailLoading,
    error,
    loadList,
    loadDetail,
    createItem,
    updateItem,
    deleteItem
  };
}
