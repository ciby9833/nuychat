import { message } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";

import { listAgents, listCsatResponses, listCsatSurveys, patchCsatSurveyStatus } from "../../../api";
import type { AgentProfile, CsatResponseListResponse, CsatSurveyItem, CsatSurveyListResponse, ResponseFilter, SurveyFilter } from "../types";

const DEFAULT_PAGE_SIZE = 20;

export function useCsatData() {
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [surveyFilter, setSurveyFilter] = useState<SurveyFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [responseFilter, setResponseFilter] = useState<ResponseFilter>({
    from: dayjs().subtract(7, "day").format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD")
  });
  const [surveys, setSurveys] = useState<CsatSurveyListResponse | null>(null);
  const [responses, setResponses] = useState<CsatResponseListResponse | null>(null);

  const load = useCallback(async (
    nextSurveyFilter: SurveyFilter = surveyFilter,
    nextResponseFilter: ResponseFilter = responseFilter
  ) => {
    setLoading(true);
    try {
      const [surveyData, responseData, agentList] = await Promise.all([
        listCsatSurveys({ ...nextSurveyFilter, page: 1, pageSize: DEFAULT_PAGE_SIZE }),
        listCsatResponses({ ...nextResponseFilter, page: 1, pageSize: DEFAULT_PAGE_SIZE }),
        listAgents()
      ]);
      setSurveys(surveyData);
      setResponses(responseData);
      setAgents(agentList);
    } catch (err) {
      void message.error(`加载 CSAT 数据失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [responseFilter, surveyFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSurveyPage = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const data = await listCsatSurveys({ ...surveyFilter, page, pageSize });
      setSurveys(data);
    } catch (err) {
      void message.error(`加载 CSAT 调查失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [surveyFilter]);

  const loadResponsePage = useCallback(async (page: number, pageSize: number) => {
    setLoading(true);
    try {
      const data = await listCsatResponses({ ...responseFilter, page, pageSize });
      setResponses(data);
    } catch (err) {
      void message.error(`加载 CSAT 结果失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [responseFilter]);

  const markSurveySent = useCallback(async (row: CsatSurveyItem) => {
    try {
      await patchCsatSurveyStatus(row.surveyId, "sent");
      await load();
    } catch (err) {
      void message.error(`更新状态失败: ${(err as Error).message}`);
    }
  }, [load]);

  const surveySummary = useMemo(
    () => surveys?.summary ?? { total: 0, scheduled: 0, sent: 0, responded: 0, expired: 0, failed: 0 },
    [surveys]
  );

  const averageRating = useMemo(
    () => Number((responses?.summary.averageRating ?? 0).toFixed(2)),
    [responses]
  );

  return {
    loading,
    agents,
    surveyFilter,
    responseFilter,
    surveys,
    responses,
    surveySummary,
    averageRating,
    setSurveyFilter,
    setResponseFilter,
    load,
    loadSurveyPage,
    loadResponsePage,
    markSurveySent
  };
}
