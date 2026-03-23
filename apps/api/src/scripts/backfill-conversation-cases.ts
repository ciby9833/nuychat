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
  current_segment_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type ExistingCaseRow = {
  case_id: string;
  status: string;
  opened_at: string;
};

async function main() {
  const summary = assertExpectedDevelopmentDatabase();

  const conversations = await db("conversations")
    .select(
      "tenant_id",
      "conversation_id",
      "customer_id",
      "status",
      "assigned_agent_id",
      "current_handler_type",
      "current_handler_id",
      "current_segment_id",
      "created_at",
      "updated_at",
      "last_message_at",
      "last_message_preview"
    )
    .orderBy("updated_at", "asc") as ConversationRow[];

  let casesCreated = 0;
  let conversationsLinked = 0;
  let segmentsPatched = 0;
  let messagesPatched = 0;
  let tasksPatched = 0;
  let intelligencePatched = 0;
  let memoryPatched = 0;

  for (const conversation of conversations) {
    await db.transaction(async (trx) => {
      const existingCases = await trx("conversation_cases")
        .where({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id
        })
        .select("case_id", "status", "opened_at")
        .orderBy("opened_at", "desc") as ExistingCaseRow[];

      let caseId = pickCaseId(existingCases);

      if (!caseId) {
        const messageStats = await trx("messages")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .select(
            trx.raw("max(case when direction = 'inbound' then created_at end) as last_customer_message_at"),
            trx.raw("max(case when direction = 'outbound' and sender_type = 'agent' then created_at end) as last_agent_message_at"),
            trx.raw("max(case when direction = 'outbound' and sender_type = 'bot' then created_at end) as last_ai_message_at")
          )
          .first<{
            last_customer_message_at: string | null;
            last_agent_message_at: string | null;
            last_ai_message_at: string | null;
          } | undefined>();

        const summaryRow = await trx("conversation_intelligence")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .select("summary")
          .first<{ summary: string | null } | undefined>();

        const [created] = await trx("conversation_cases")
          .insert({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id,
            customer_id: conversation.customer_id,
            current_segment_id: isClosedConversation(conversation.status) ? null : conversation.current_segment_id,
            case_type: "general_inquiry",
            case_source: "system",
            title: buildCaseTitle(conversation.last_message_preview),
            summary: summaryRow?.summary ?? conversation.last_message_preview ?? null,
            status: mapCaseStatus(conversation.status),
            priority: "normal",
            current_owner_type: deriveOwnerType(conversation),
            current_owner_id: deriveOwnerId(conversation),
            opened_at: conversation.created_at,
            resolved_at: conversation.status === "resolved" ? conversation.updated_at : null,
            closed_at: conversation.status === "closed" ? conversation.updated_at : null,
            last_customer_message_at: messageStats?.last_customer_message_at ?? null,
            last_agent_message_at: messageStats?.last_agent_message_at ?? null,
            last_ai_message_at: messageStats?.last_ai_message_at ?? null,
            last_activity_at: conversation.last_message_at ?? conversation.updated_at,
            metadata: JSON.stringify({
              source: "history-backfill",
              threadStatus: conversation.status
            }),
            created_at: conversation.created_at,
            updated_at: conversation.updated_at
          })
          .returning(["case_id"]);

        caseId = String(created.case_id);
        casesCreated += 1;
      }

      const currentCaseId = isClosedConversation(conversation.status) ? null : caseId;

      const conversationUpdate = await trx("conversations")
        .where({
          tenant_id: conversation.tenant_id,
          conversation_id: conversation.conversation_id
        })
        .where((builder) => {
          builder.whereNull("current_case_id");
          if (currentCaseId) builder.orWhereNot("current_case_id", currentCaseId);
        })
        .update({
          current_case_id: currentCaseId,
          updated_at: trx.fn.now()
        });

      conversationsLinked += Number(conversationUpdate ?? 0);

      segmentsPatched += Number(
        (await trx("conversation_segments")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .whereNull("case_id")
          .update({ case_id: caseId })) ?? 0
      );

      messagesPatched += Number(
        (await trx("messages")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .whereNull("case_id")
          .update({ case_id: caseId })) ?? 0
      );

      tasksPatched += Number(
        (await trx("async_tasks")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .whereNull("case_id")
          .update({ case_id: caseId })) ?? 0
      );

      intelligencePatched += Number(
        (await trx("conversation_intelligence")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .whereNull("case_id")
          .update({ case_id: caseId })) ?? 0
      );

      memoryPatched += Number(
        (await trx("customer_memory_items")
          .where({
            tenant_id: conversation.tenant_id,
            conversation_id: conversation.conversation_id
          })
          .whereNull("case_id")
          .update({ case_id: caseId })) ?? 0
      );
    });
  }

  const [missingCases, missingCurrentCase, messagesWithoutCase, segmentsWithoutCase, tasksWithoutCase, orphanTasksWithoutConversation] = await Promise.all([
    db("conversations as c")
      .leftJoin("conversation_cases as cc", function joinCases() {
        this.on("cc.conversation_id", "=", "c.conversation_id").andOn("cc.tenant_id", "=", "c.tenant_id");
      })
      .whereNull("cc.case_id")
      .count<{ cnt: string }>("c.conversation_id as cnt")
      .first(),
    db("conversations")
      .whereNotIn("status", ["resolved", "closed"])
      .whereNull("current_case_id")
      .count<{ cnt: string }>("conversation_id as cnt")
      .first(),
    db("messages").whereNull("case_id").count<{ cnt: string }>("message_id as cnt").first(),
    db("conversation_segments").whereNull("case_id").count<{ cnt: string }>("segment_id as cnt").first(),
    db("async_tasks").whereNotNull("conversation_id").whereNull("case_id").count<{ cnt: string }>("task_id as cnt").first(),
    db("async_tasks").whereNull("conversation_id").whereNull("case_id").count<{ cnt: string }>("task_id as cnt").first()
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        db: summary,
        scanned: conversations.length,
        casesCreated,
        conversationsLinked,
        segmentsPatched,
        messagesPatched,
        tasksPatched,
        intelligencePatched,
        memoryPatched,
        conversationsWithoutAnyCase: Number(missingCases?.cnt ?? 0),
        activeConversationsWithoutCurrentCase: Number(missingCurrentCase?.cnt ?? 0),
        messagesWithoutCase: Number(messagesWithoutCase?.cnt ?? 0),
        segmentsWithoutCase: Number(segmentsWithoutCase?.cnt ?? 0),
        tasksWithoutCase: Number(tasksWithoutCase?.cnt ?? 0),
        orphanTasksWithoutConversation: Number(orphanTasksWithoutConversation?.cnt ?? 0)
      },
      null,
      2
    )
  );
}

function pickCaseId(existingCases: ExistingCaseRow[]) {
  const active = existingCases.find((item) => isActiveCaseStatus(item.status));
  return active?.case_id ?? existingCases[0]?.case_id ?? null;
}

function isActiveCaseStatus(status: string) {
  return status === "open" || status === "in_progress" || status === "waiting_customer" || status === "waiting_internal";
}

function isClosedConversation(status: string) {
  return status === "resolved" || status === "closed";
}

function mapCaseStatus(status: string) {
  if (status === "resolved") return "resolved";
  if (status === "closed") return "closed";
  if (status === "queued" || status === "open") return "open";
  return "in_progress";
}

function deriveOwnerType(conversation: ConversationRow) {
  if (isClosedConversation(conversation.status)) return "system";
  if (conversation.assigned_agent_id) return "agent";
  if (conversation.current_handler_type === "ai" && conversation.current_handler_id) return "ai";
  if (conversation.current_handler_type === "workflow") return "workflow";
  return "system";
}

function deriveOwnerId(conversation: ConversationRow) {
  if (isClosedConversation(conversation.status)) return null;
  if (conversation.assigned_agent_id) return conversation.assigned_agent_id;
  return conversation.current_handler_id ?? null;
}

function buildCaseTitle(lastMessagePreview: string | null) {
  const value = typeof lastMessagePreview === "string" ? lastMessagePreview.trim() : "";
  if (!value) return "Historical case";
  return value.slice(0, 255);
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
