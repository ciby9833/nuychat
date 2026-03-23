import { db, closeDatabase } from "../infra/db/client.js";
import { assertExpectedDevelopmentDatabase, getDatabaseSummary } from "../infra/db/config.js";

type ConversationRow = {
  tenant_id: string;
  conversation_id: string;
  customer_id: string;
  status: string;
  assigned_agent_id: string | null;
  current_handler_type: string | null;
  current_handler_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  assigned_ai_agent_id: string | null;
};

async function main() {
  const summary = assertExpectedDevelopmentDatabase();

  const conversations = await db("conversations as c")
    .leftJoin("conversation_segments as s", function joinSegment() {
      this.on("s.conversation_id", "=", "c.conversation_id").andOn("s.tenant_id", "=", "c.tenant_id");
    })
    .leftJoin("queue_assignments as qa", function joinQueueAssignment() {
      this.on("qa.conversation_id", "=", "c.conversation_id").andOn("qa.tenant_id", "=", "c.tenant_id");
    })
    .whereNull("s.segment_id")
    .select(
      "c.tenant_id",
      "c.conversation_id",
      "c.customer_id",
      "c.status",
      "c.assigned_agent_id",
      "c.current_handler_type",
      "c.current_handler_id",
      "c.created_at",
      "c.updated_at",
      "c.last_message_at",
      "qa.assigned_ai_agent_id"
    )
    .orderBy("c.updated_at", "asc") as ConversationRow[];

  let segmentsCreated = 0;
  let messagesPatched = 0;

  for (const conversation of conversations) {
    await db.transaction(async (trx) => {
      const timeBounds = await trx("messages")
        .where({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id
        })
        .min<{ started_at: string | null }>("created_at as started_at")
        .max<{ ended_at: string | null }>("created_at as ended_at")
        .first();

      const startedAt =
        timeBounds?.started_at ??
        conversation.created_at;
      const endedAt =
        timeBounds?.ended_at ??
        conversation.last_message_at ??
        conversation.updated_at;

      const owner = deriveOwner(conversation);
      const segmentStatus = isClosedConversation(conversation.status) ? "resolved" : "active";

      const [segment] = await trx("conversation_segments")
        .insert({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id,
          customer_id: conversation.customer_id,
          owner_type: owner.ownerType,
          owner_agent_id: owner.ownerAgentId,
          owner_ai_agent_id: owner.ownerAiAgentId,
          status: segmentStatus,
          opened_reason: "history-backfill",
          closed_reason: isClosedConversation(conversation.status) ? `history-backfill:${conversation.status}` : null,
          started_at: startedAt,
          ended_at: isClosedConversation(conversation.status) ? endedAt : null,
          created_at: startedAt,
          updated_at: endedAt
        })
        .returning(["segment_id"]);

      segmentsCreated += 1;

      const segmentId = segment.segment_id as string;

      const messageUpdate = await trx("messages")
        .where({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id
        })
        .whereNull("segment_id")
        .update({ segment_id: segmentId });

      messagesPatched += Number(messageUpdate ?? 0);

      await trx("conversations")
        .where({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id
        })
        .update({
          current_segment_id: isClosedConversation(conversation.status) ? null : segmentId,
          current_handler_type: owner.currentHandlerType,
          current_handler_id: owner.currentHandlerId,
          updated_at: trx.fn.now()
        });
    });
  }

  const [threadsWithoutAnySegment, activeThreadsWithoutCurrentSegment, remainingMessages] = await Promise.all([
    db("conversations as c")
      .leftJoin("conversation_segments as s", function joinSegment() {
        this.on("s.conversation_id", "=", "c.conversation_id").andOn("s.tenant_id", "=", "c.tenant_id");
      })
      .whereNull("s.segment_id")
      .count<{ cnt: string }>("c.conversation_id as cnt")
      .first(),
    db("conversations")
      .whereNotIn("status", ["resolved", "closed"])
      .whereNull("current_segment_id")
      .count<{ cnt: string }>("conversation_id as cnt")
      .first(),
    db("messages").whereNull("segment_id").count<{ cnt: string }>("message_id as cnt").first()
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        db: summary,
        scanned: conversations.length,
        segmentsCreated,
        messagesPatched,
        conversationsWithoutAnySegment: Number(threadsWithoutAnySegment?.cnt ?? 0),
        activeConversationsWithoutCurrentSegment: Number(activeThreadsWithoutCurrentSegment?.cnt ?? 0),
        remainingMessagesWithoutSegment: Number(remainingMessages?.cnt ?? 0)
      },
      null,
      2
    )
  );
}

function deriveOwner(conversation: ConversationRow) {
  if (conversation.assigned_agent_id) {
    return {
      ownerType: "human",
      ownerAgentId: conversation.assigned_agent_id,
      ownerAiAgentId: null,
      currentHandlerType: isClosedConversation(conversation.status) ? "system" : "human",
      currentHandlerId: isClosedConversation(conversation.status) ? null : conversation.assigned_agent_id
    };
  }

  if (conversation.assigned_ai_agent_id || conversation.current_handler_type === "ai") {
    const aiAgentId = conversation.assigned_ai_agent_id ?? conversation.current_handler_id ?? null;
    return {
      ownerType: "ai",
      ownerAgentId: null,
      ownerAiAgentId: aiAgentId,
      currentHandlerType: isClosedConversation(conversation.status) ? "system" : "ai",
      currentHandlerId: isClosedConversation(conversation.status) ? null : aiAgentId
    };
  }

  return {
    ownerType: "system",
    ownerAgentId: null,
    ownerAiAgentId: null,
    currentHandlerType: "system",
    currentHandlerId: null
  };
}

function isClosedConversation(status: string) {
  return status === "resolved" || status === "closed";
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          ok: false,
          db: getDatabaseSummary(),
          error: error instanceof Error ? error.message : String(error)
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
