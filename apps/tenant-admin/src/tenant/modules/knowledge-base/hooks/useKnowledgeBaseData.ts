import { Form } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../../api";
import type { KBEntry, KBFormData } from "../types";

const CATEGORIES = ["policy", "shipping", "payment", "order", "faq", "product", "general"];

export function useKnowledgeBaseData() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<KBFormData>();

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (catFilter) params.set("category", catFilter);
      if (reviewFilter) params.set("needsReview", "true");
      const result = await api<{ entries: KBEntry[]; total: number; needsReviewCount: number }>(
        `/api/admin/knowledge-base?${params}`
      );
      setEntries(result.entries);
      setTotal(result.total);
      setNeedsReviewCount(result.needsReviewCount ?? 0);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [search, catFilter, reviewFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.setFieldsValue({ category: "general", title: "", content: "", tags: [] });
    setCreateOpen(true);
  }, [form]);

  const openEdit = useCallback((entry: KBEntry) => {
    setEditing(entry);
    form.setFieldsValue({ category: entry.category, title: entry.title, content: entry.content, tags: entry.tags });
    setCreateOpen(true);
  }, [form]);

  const save = useCallback(async () => {
    const values = await form.validateFields();
    if (editing) {
      // When saving an entry that was flagged for review, automatically clear the flag
      const patch: Record<string, unknown> = { ...values };
      if (editing.needs_review) patch.needsReview = false;
      await api(`/api/admin/knowledge-base/${editing.entry_id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
    } else {
      await api("/api/admin/knowledge-base", { method: "POST", body: JSON.stringify(values) });
    }
    setCreateOpen(false);
    setEditing(null);
    await load();
  }, [editing, form, load]);

  /** Clear the needs_review flag without changing content (mark as "reviewed, ok as-is"). */
  const markReviewed = useCallback(async (id: string) => {
    await api(`/api/admin/knowledge-base/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ needsReview: false })
    });
    await load();
  }, [load]);

  const deactivate = useCallback(async (id: string) => {
    await api(`/api/admin/knowledge-base/${id}`, { method: "DELETE" });
    await load();
  }, [load]);

  const filteredEntries = useMemo(() => entries, [entries]);

  return {
    entries,
    total,
    needsReviewCount,
    search,
    catFilter,
    reviewFilter,
    editing,
    createOpen,
    error,
    form,
    categories: CATEGORIES,
    filteredEntries,
    setSearch,
    setCatFilter,
    setReviewFilter,
    setCreateOpen,
    setEditing,
    load,
    openCreate,
    openEdit,
    save,
    markReviewed,
    deactivate
  };
}
