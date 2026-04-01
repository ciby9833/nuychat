/**
 * Verifier / Evaluator Layer — Public API
 */
export { evaluatePointA, evaluatePointB } from "./verifier.service.js";
export type {
  VerifierVerdict,
  VerifierAction,
  VerifierRuleId,
  RuleFinding,
  PointAContext,
  PointBContext,
  VerifierRule
} from "./types.js";
