/**
 * 作用:
 * - 统一刷新 WA 会话的列表投影并向 realtime 总线广播。
 *
 * 交互:
 * - 被消息入站、聊天同步、联系人同步和工作台服务调用。
 * - 查询会话 list item 后发出 `wa.conversation.updated`。
 */
import type { Knex } from "knex";

import { withTenantTransaction } from "../../infra/db/client.js";
import { getWaConversationListItem } from "./wa-conversation.repository.js";
import { emitWaConversationUpdated } from "./wa-realtime.service.js";

export async function refreshWaConversationProjection(
  trx: Knex.Transaction,
  input: { tenantId: string; waAccountId: string; waConversationId: string }
) {
  const conversation = await getWaConversationListItem(trx, {
    tenantId: input.tenantId,
    waConversationId: input.waConversationId
  });
  if (!conversation) return null;

  emitWaConversationUpdated({
    tenantId: input.tenantId,
    waAccountId: input.waAccountId,
    conversation
  });
  return conversation;
}

export async function emitWaConversationProjection(input: {
  tenantId: string;
  waAccountId: string;
  waConversationId: string;
}) {
  return withTenantTransaction(input.tenantId, async (trx) =>
    refreshWaConversationProjection(trx, input)
  );
}
