/**
 * 菜单路径与名称: 客户中心 -> 渠道配置 -> WhatsApp 绑定
 * 文件职责: 负责 WhatsApp Embedded Signup 流程，包括 Facebook SDK 加载、授权拉起和消息回传解析。
 * 主要交互文件:
 * - ./hooks/useChannelsData.ts: 触发 SDK 加载和授权流程。
 * - ./types.ts: 提供 EmbeddedSignupFinishPayload 类型。
 */

import i18next from "i18next";
import type { EmbeddedSignupFinishPayload } from "./types";

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      login: (callback: (response: { status?: string; authResponse?: { code?: string } }) => void, params?: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

export async function loadFacebookSdk(appId: string): Promise<void> {
  if (window.FB) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      const timer = window.setInterval(() => {
        if (window.FB) {
          window.clearInterval(timer);
          resolve();
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(timer);
        reject(new Error(i18next.t("channelsModule.signup.sdkInitTimeout")));
      }, 10000);
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v21.0"
      });
      resolve();
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error(i18next.t("channelsModule.signup.sdkLoadFailed")));
    document.body.appendChild(script);
  });
}

export async function runWhatsAppEmbeddedSignup(configId: string): Promise<EmbeddedSignupFinishPayload> {
  return new Promise<EmbeddedSignupFinishPayload>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(i18next.t("channelsModule.signup.signupTimeout")));
    }, 120000);

    const onMessage = (event: MessageEvent) => {
      if (!String(event.origin).includes("facebook.com")) return;
      const payload = parseEmbeddedSignupMessage(event.data);
      if (!payload) return;
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
    window.FB?.login(
      (response) => {
        if (response.status !== "connected" && !response.authResponse?.code) {
          cleanup();
          reject(new Error(i18next.t("channelsModule.signup.authIncomplete")));
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          feature: "whatsapp_embedded_signup",
          sessionInfoVersion: 3
        }
      }
    );
  });
}

function parseEmbeddedSignupMessage(input: unknown): EmbeddedSignupFinishPayload | null {
  let payload = input;
  if (typeof input === "string") {
    try {
      payload = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }

  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const event = typeof record.event === "string" ? record.event.toUpperCase() : "";
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;

  if (event && event !== "FINISH" && event !== "WA_EMBEDDED_SIGNUP") {
    return null;
  }

  const phoneNumberId = readStringField(data, ["phone_number_id", "phoneNumberId"]);
  if (!phoneNumberId) return null;

  return {
    phoneNumberId,
    wabaId: readStringField(data, ["waba_id", "wabaId"]) ?? undefined,
    displayPhoneNumber: readStringField(data, ["display_phone_number", "displayPhoneNumber"]) ?? undefined,
    businessAccountName: readStringField(data, ["business_name", "businessAccountName", "waba_name"]) ?? undefined
  };
}

function readStringField(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
