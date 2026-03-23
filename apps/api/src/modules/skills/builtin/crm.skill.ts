import { skillRegistry } from "../skill.registry.js";

/**
 * CRM skill — customer profile + order history lookup.
 * Uses the customers + conversations tables which already have RLS applied.
 * The db/trx in ctx runs inside the tenant transaction so RLS is effective.
 */
skillRegistry.register({
  name: "get_customer_info",
  description:
    "Retrieve a customer's profile and recent conversation history from the CRM. " +
    "Use when you need to know the customer's tier (VIP, premium, standard), preferred language, " +
    "tags, or how many previous conversations they have had.",
  parameters: {
    type: "object",
    properties: {
      customerId: {
        type: "string",
        description: "The internal customer UUID. Use if already known from context."
      },
      externalRef: {
        type: "string",
        description: "The customer's external reference (phone number, email, or platform user ID). Use if customerId is not known."
      }
    }
  },

  async execute(input, ctx) {
    const customerId = typeof input.customerId === "string" ? input.customerId.trim() : null;
    const externalRef = typeof input.externalRef === "string" ? input.externalRef.trim() : null;

    if (!customerId && !externalRef) {
      return { error: "Either customerId or externalRef is required" };
    }

    try {
      const qb = ctx.db("customers")
        .select(
          "customer_id",
          "display_name",
          "tier",
          "language",
          "external_ref",
          "tags",
          "created_at"
        )
        .where("tenant_id", ctx.tenantId);

      if (customerId) {
        qb.where("customer_id", customerId);
      } else {
        qb.where("external_ref", externalRef!);
      }

      const customer = await qb.first();
      if (!customer) {
        return { error: "Customer not found" };
      }

      // Fetch recent conversation summaries (last 5)
      const recentConvos = await ctx.db("conversations")
        .select("conversation_id", "channel_type", "status", "last_message_at", "last_message_preview")
        .where({ tenant_id: ctx.tenantId, customer_id: customer.customer_id })
        .orderBy("last_message_at", "desc")
        .limit(5);

      const totalConvos = await ctx.db("conversations")
        .where({ tenant_id: ctx.tenantId, customer_id: customer.customer_id })
        .count("conversation_id as cnt")
        .first();

      return {
        customer: {
          id: customer.customer_id,
          name: customer.display_name,
          tier: customer.tier,
          language: customer.language,
          externalRef: customer.external_ref,
          tags: customer.tags ?? [],
          memberSince: customer.created_at
        },
        stats: {
          totalConversations: Number((totalConvos as { cnt: string })?.cnt ?? 0)
        },
        recentConversations: recentConvos.map((c: {
          conversation_id: string;
          channel_type: string;
          status: string;
          last_message_at: string;
          last_message_preview: string;
        }) => ({
          id: c.conversation_id,
          channel: c.channel_type,
          status: c.status,
          lastMessageAt: c.last_message_at,
          preview: c.last_message_preview
        }))
      };
    } catch (err) {
      return { error: "CRM lookup failed", detail: (err as Error).message };
    }
  }
});
