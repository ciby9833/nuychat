/**
 * Seed migration — inserts a complete demo tenant for local development.
 *
 * Credentials:
 *   Admin : admin@demo.com / admin123
 *   Agent : agent@demo.com / agent123
 *   Tenant slug : demo-tenant
 *   Channel IDs : demo-wa-channel / demo-web-channel
 */
import crypto from "node:crypto";
import { promisify } from "node:util";
import type { Knex } from "knex";

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function up(knex: Knex): Promise<void> {
  // Skip seed if demo tenant already exists (idempotent)
  const existing = await knex("tenants").where("slug", "demo-tenant").first();
  if (existing) return;

  // --- Tenant plan ---
  const [plan] = await knex("tenant_plans")
    .insert({
      code: "starter",
      name: "Starter",
      max_agents: 5,
      max_monthly_conversations: 5000,
      ai_token_quota_monthly: 500_000,
      features: JSON.stringify(["ai_copilot", "rule_engine", "omnichannel"])
    })
    .returning("*");

  // --- Tenant ---
  const [tenant] = await knex("tenants")
    .insert({
      plan_id: plan.plan_id,
      name: "Demo Tenant",
      slug: "demo-tenant",
      status: "active",
      operating_mode: "ai_first"
    })
    .returning("*");

  const tenantId: string = tenant.tenant_id;

  // --- AI config ---
  await knex("ai_configs").insert({
    tenant_id: tenantId,
    source: "platform",
    provider: "openai",
    model: "gpt-4o-mini",
    can_override: true,
    quotas: JSON.stringify({ monthly_tokens: 500_000 })
  });

  // --- Channel config (WhatsApp demo) ---
  await knex("channel_configs").insert({
    tenant_id: tenantId,
    channel_type: "whatsapp",
    channel_id: "demo-wa-channel",
    encrypted_config: JSON.stringify({
      onboardingStatus: "bound",
      phoneNumberId: "demo_phone_number_id",
      wabaId: "demo_waba_id",
      businessAccountName: "Demo Business",
      displayPhoneNumber: "+62 812-0000-0000",
      connectedAt: new Date().toISOString()
    }),
    is_active: true
  });
  await knex("channel_configs").insert({
    tenant_id: tenantId,
    channel_type: "web",
    channel_id: "demo-web-channel",
    encrypted_config: JSON.stringify({
      widgetName: "Demo Web Chat",
      publicChannelKey: "demo-web-public",
      allowedOrigins: ["http://localhost:5176"]
    }),
    is_active: true
  });

  // --- Users ---
  const adminHash = await hashPassword("admin123");
  const agentHash = await hashPassword("agent123");

  await knex("users").insert({
    tenant_id: tenantId,
    email: "admin@demo.com",
    role: "admin",
    password_hash: adminHash
  });

  const [agentUser] = await knex("users")
    .insert({
      tenant_id: tenantId,
      email: "agent@demo.com",
      role: "agent",
      password_hash: agentHash
    })
    .returning("*");

  // --- Org structure ---
  const [bu] = await knex("business_units")
    .insert({
      tenant_id: tenantId,
      code: "CS",
      name: "Customer Service"
    })
    .returning("*");

  const [module_] = await knex("modules")
    .insert({
      tenant_id: tenantId,
      business_unit_id: bu.bu_id,
      code: "GEN",
      name: "General Support",
      operating_mode: "ai_first"
    })
    .returning("*");

  const [skillGroup] = await knex("skill_groups")
    .insert({
      tenant_id: tenantId,
      module_id: module_.module_id,
      code: "GENERAL",
      name: "General",
      priority: 1,
      routing_strategy: "least_busy",
      sla_first_response_seconds: 300,
      sla_resolution_seconds: 86400
    })
    .returning("*");

  // --- Agent profile ---
  const [agentProfile] = await knex("agent_profiles")
    .insert({
      tenant_id: tenantId,
      user_id: agentUser.user_id,
      display_name: "Demo Agent",
      status: "online",
      max_concurrency: 6,
      seniority_level: "mid"
    })
    .returning("*");

  // --- Agent skills (linked to the general skill group) ---
  await knex("agent_skills").insert({
    tenant_id: tenantId,
    agent_id: agentProfile.agent_id,
    skill_group_id: skillGroup.skill_group_id,
    proficiency_level: 3,
    can_handle_vip: false,
    is_active: true
  });

  // --- Default routing rule ---
  await knex("routing_rules").insert({
    tenant_id: tenantId,
    name: "Default to General",
    priority: 100,
    conditions: JSON.stringify({}),
    actions: JSON.stringify({
      targetSkillGroupCode: "GENERAL",
      assignmentStrategy: "least_busy"
    }),
    is_active: true
  });
}

export async function down(knex: Knex): Promise<void> {
  const tenant = await knex("tenants").where("slug", "demo-tenant").first();
  if (!tenant) return;
  const tid: string = tenant.tenant_id;

  await knex("routing_rules").where({ tenant_id: tid }).delete();
  await knex("agent_skills").where({ tenant_id: tid }).delete();
  await knex("agent_profiles").where({ tenant_id: tid }).delete();
  await knex("skill_groups").where({ tenant_id: tid }).delete();
  await knex("modules").where({ tenant_id: tid }).delete();
  await knex("business_units").where({ tenant_id: tid }).delete();
  await knex("users").where({ tenant_id: tid }).delete();
  await knex("channel_configs").where({ tenant_id: tid }).delete();
  await knex("ai_configs").where({ tenant_id: tid }).delete();
  await knex("tenants").where({ tenant_id: tid }).delete();
  await knex("tenant_plans").where("code", "starter").delete();
}
