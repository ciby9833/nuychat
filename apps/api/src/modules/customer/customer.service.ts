import type { Knex } from "knex";

type CustomerRecord = {
  customer_id: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
};

export class CustomerService {
  async getOrCreateByExternalRef(
    db: Knex | Knex.Transaction,
    input: {
      tenantId: string;
      channelType: string;
      externalRef: string;
      displayName?: string;
      language?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const existing = await db<CustomerRecord>("customers")
      .select("customer_id", "display_name", "metadata")
      .where({
        tenant_id: input.tenantId,
        primary_channel: input.channelType,
        external_ref: input.externalRef
      } as any)
      .first();

    if (existing) {
      const nextPatch: Record<string, unknown> = {};
      if (!existing.display_name && input.displayName) {
        nextPatch.display_name = input.displayName;
      }
      if (input.metadata && Object.keys(input.metadata).length > 0) {
        nextPatch.metadata = {
          ...(existing.metadata ?? {}),
          ...input.metadata
        };
      }

      if (Object.keys(nextPatch).length > 0) {
        await db("customers")
          .where({ customer_id: existing.customer_id })
          .update(nextPatch);
      }

      return { customerId: existing.customer_id };
    }

    const [customer] = await db("customers")
      .insert({
        tenant_id: input.tenantId,
        primary_channel: input.channelType,
        external_ref: input.externalRef,
        display_name: input.displayName ?? null,
        language: input.language ?? "id",
        metadata: input.metadata ?? {}
      })
      .returning(["customer_id"]);

    return { customerId: customer.customer_id as string };
  }
}
