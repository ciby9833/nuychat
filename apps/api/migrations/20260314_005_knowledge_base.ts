/**
 * Migration 005 — Knowledge Base
 *
 * Creates `knowledge_base_entries` with full-text search support and seeds
 * a set of demo articles for the demo tenant.
 */
import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── Table ────────────────────────────────────────────────────────────────────
  await knex.schema.createTable("knowledge_base_entries", (t) => {
    t.uuid("entry_id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.uuid("tenant_id").notNullable().references("tenant_id").inTable("tenants").onDelete("CASCADE");
    t.string("category", 50).notNullable().defaultTo("general");
    t.string("title", 200).notNullable();
    t.text("content").notNullable();
    t.jsonb("tags").notNullable().defaultTo("[]");
    t.boolean("is_active").notNullable().defaultTo(true);
    t.integer("hit_count").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index(["tenant_id", "category", "is_active"], "kb_tenant_category_idx");
  });

  // RLS
  await knex.raw(`
    ALTER TABLE knowledge_base_entries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE knowledge_base_entries FORCE ROW LEVEL SECURITY;
    CREATE POLICY knowledge_base_entries_tenant_isolation ON knowledge_base_entries
      USING (tenant_id = current_tenant_id())
      WITH CHECK (tenant_id = current_tenant_id());
  `);

  // updated_at trigger
  await knex.raw(`
    CREATE TRIGGER knowledge_base_entries_set_updated_at
    BEFORE UPDATE ON knowledge_base_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  // ── Full-text search index via tsvector ──────────────────────────────────────
  await knex.raw(`
    ALTER TABLE knowledge_base_entries
      ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
      ) STORED;

    CREATE INDEX knowledge_base_entries_fts_idx
      ON knowledge_base_entries
      USING GIN (search_vector);
  `);

  // ── Seed demo data for the demo tenant ──────────────────────────────────────
  const tenant = await knex("tenants").where("slug", "demo-tenant").first();
  if (!tenant) return;

  const tid: string = tenant.tenant_id;
  const entries = [
    {
      tenant_id: tid,
      category: "policy",
      title: "Return & Refund Policy",
      content:
        "We accept returns within 30 days of delivery for unused items in original packaging. " +
        "Refunds are processed within 3-5 business days after we receive the returned item. " +
        "To initiate a return, provide your order ID to our support team.",
      tags: JSON.stringify(["return", "refund", "policy"])
    },
    {
      tenant_id: tid,
      category: "shipping",
      title: "Shipping & Delivery Times",
      content:
        "Standard shipping takes 3-5 business days. Express shipping (1-2 days) is available for an additional fee. " +
        "Orders placed before 2 PM are shipped the same day. " +
        "Free shipping on orders above IDR 200,000.",
      tags: JSON.stringify(["shipping", "delivery", "timeline"])
    },
    {
      tenant_id: tid,
      category: "payment",
      title: "Accepted Payment Methods",
      content:
        "We accept: Bank Transfer (BCA, Mandiri, BNI, BRI), Credit/Debit Card (Visa, Mastercard), " +
        "GoPay, OVO, DANA, ShopeePay, and COD (Cash on Delivery) for eligible areas. " +
        "Payment confirmation is sent via email and WhatsApp within 1 hour.",
      tags: JSON.stringify(["payment", "transfer", "gopay", "ovo"])
    },
    {
      tenant_id: tid,
      category: "order",
      title: "How to Track Your Order",
      content:
        "You can track your order by providing your order ID (e.g. ORD12345) to our support team. " +
        "Tracking is also available via our website. " +
        "Once shipped, you will receive a tracking / AWB number via WhatsApp.",
      tags: JSON.stringify(["order", "tracking", "status"])
    },
    {
      tenant_id: tid,
      category: "order",
      title: "Order Cancellation Policy",
      content:
        "Orders can be cancelled for free within 1 hour of placement. " +
        "After 1 hour, cancellation is only possible if the order has not been shipped. " +
        "Contact support with your order ID to request cancellation. " +
        "Refunds for cancelled orders are processed within 1-2 business days.",
      tags: JSON.stringify(["cancel", "cancellation", "order"])
    },
    {
      tenant_id: tid,
      category: "product",
      title: "Product Authenticity Guarantee",
      content:
        "All products sold are 100% authentic and sourced directly from brand distributors. " +
        "Each item comes with an official warranty card where applicable. " +
        "If you receive a counterfeit item, contact us immediately for a full refund.",
      tags: JSON.stringify(["authentic", "warranty", "guarantee"])
    },
    {
      tenant_id: tid,
      category: "faq",
      title: "What to do if my package is damaged",
      content:
        "If your package arrives damaged, take photos immediately and contact us within 24 hours. " +
        "Provide your order ID, photos of the damage, and a brief description. " +
        "We will arrange a replacement or refund within 2 business days.",
      tags: JSON.stringify(["damage", "broken", "package", "complaint"])
    },
    {
      tenant_id: tid,
      category: "faq",
      title: "How to change delivery address",
      content:
        "Delivery address changes are only possible before the order is shipped. " +
        "Contact support with your order ID and new delivery address as soon as possible. " +
        "Once shipped, address changes cannot be made; you will need to wait for delivery and arrange a return.",
      tags: JSON.stringify(["address", "change", "delivery"])
    }
  ];

  await knex("knowledge_base_entries").insert(entries);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER IF EXISTS knowledge_base_entries_set_updated_at ON knowledge_base_entries");
  await knex.raw("DROP POLICY IF EXISTS knowledge_base_entries_tenant_isolation ON knowledge_base_entries");
  await knex.schema.dropTableIfExists("knowledge_base_entries");
}
