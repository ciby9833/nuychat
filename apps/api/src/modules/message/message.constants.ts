export const CUSTOMER_MESSAGE_SENDER_TYPE = "customer" as const;

export const SERVICE_REPLY_SENDER_TYPES = ["agent", "bot"] as const;

export function isServiceReplySenderType(value: string | null | undefined): value is (typeof SERVICE_REPLY_SENDER_TYPES)[number] {
  return typeof value === "string" && SERVICE_REPLY_SENDER_TYPES.includes(value as (typeof SERVICE_REPLY_SENDER_TYPES)[number]);
}
