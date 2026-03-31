import type {
  AgentProfile,
  CsatResponseItem,
  CsatResponseListResponse,
  CsatSurveyItem,
  CsatSurveyListResponse
} from "../../types";

export type { AgentProfile, CsatResponseItem, CsatResponseListResponse, CsatSurveyItem, CsatSurveyListResponse };

export type SurveyFilter = {
  status?: "scheduled" | "sent" | "responded" | "expired" | "failed";
  from?: string;
  to?: string;
};

export type ResponseFilter = {
  agentId?: string;
  minRating?: number;
  maxRating?: number;
  from?: string;
  to?: string;
};
