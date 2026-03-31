import { Form } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../../api";
import type { KBEntry, KBFormData } from "../types";

const CATEGORIES = ["policy", "shipping", "payment", "order", "faq", "product", "general"];

export function useKnowledgeBaseData() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [form] = Form.useForm<KBFormData>();

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (catFilter) params.set("category", catFilter);
      const result = await api<{ entries: KBEntry[]; total: number }>(`/api/admin/knowledge-base?${params}`);
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [search, catFilter]);

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
      await api(`/api/admin/knowledge-base/${editing.entry_id}`, { method: "PATCH", body: JSON.stringify(values) });
    } else {
      await api("/api/admin/knowledge-base", { method: "POST", body: JSON.stringify(values) });
    }
    setCreateOpen(false);
    setEditing(null);
    await load();
  }, [editing, form, load]);

  const deactivate = useCallback(async (id: string) => {
    await api(`/api/admin/knowledge-base/${id}`, { method: "DELETE" });
    await load();
  }, [load]);

  const filteredEntries = useMemo(() => entries, [entries]);

  return {
    entries,
    total,
    search,
    catFilter,
    editing,
    createOpen,
    error,
    form,
    categories: CATEGORIES,
    filteredEntries,
    setSearch,
    setCatFilter,
    setCreateOpen,
    setEditing,
    load,
    openCreate,
    openEdit,
    save,
    deactivate
  };
}
