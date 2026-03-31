import type { Knex } from "knex";

type CustomerRecord = {
  customer_id: string;
  display_name: string | null;
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
    }
  ) {
    const existing = await db<CustomerRecord>("customers")
      .select("customer_id", "display_name")
      .where({
        tenant_id: input.tenantId,
        primary_channel: input.channelType,
        external_ref: input.externalRef
      } as any)
      .first();

    if (existing) {
      if (!existing.display_name && input.displayName) {
        await db("customers")
          .where({ customer_id: existing.customer_id })
          .update({ display_name: input.displayName });
      }

      return { customerId: existing.customer_id };
    }

    const [customer] = await db("customers")
      .insert({
        tenant_id: input.tenantId,
        primary_channel: input.channelType,
        external_ref: input.externalRef,
        display_name: input.displayName ?? null,
        language: input.language ?? "id"
      })
      .returning(["customer_id"]);

    return { customerId: customer.customer_id as string };
  }
}
