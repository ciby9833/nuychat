import { useCallback, useEffect, useState } from "react";

import { createWebchatSession, fetchWebchatMessages, sendWebchatMessage, uploadWebchatAttachment, WebchatApiError } from "../api";
import { resolvePublicChannelKey } from "../config";
import { ChatComposer } from "../components/ChatComposer";
import { ChatHeader } from "../components/ChatHeader";
import { ChatMessages } from "../components/ChatMessages";
import type { WebchatClientContext, WebchatMessage, WebchatSession } from "../types";

const SESSION_STORAGE_KEY = "nuychat.webchat.session";

function readPublicChannelKey() {
  return resolvePublicChannelKey();
}

function readMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode")?.trim() || "full";
}

function readClientContext(): WebchatClientContext {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source")?.trim() || "web";
  const appId = params.get("app")?.trim() || null;
  const ua = navigator.userAgent;
  const width = window.innerWidth;
  const deviceType = /iPad|Tablet/i.test(ua) || (width >= 768 && width <= 1024)
    ? "tablet"
    : /Mobi|Android|iPhone/i.test(ua) || width < 768
      ? "mobile"
      : "desktop";
  return {
    source,
    appId,
    deviceType,
    platform: navigator.platform ?? null,
    userAgent: ua,
    language: navigator.language ?? null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    pageUrl: window.location.href,
    referrer: document.referrer || null
  };
}

export function ChatPage() {
  const [publicKey] = useState(readPublicChannelKey);
  const [mode] = useState(readMode);
  const [client] = useState(readClientContext);
  const [session, setSession] = useState<WebchatSession | null>(() => {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as Partial<WebchatSession>;
      if (typeof parsed.publicChannelKey !== "string" || parsed.publicChannelKey.length === 0) {
        return null;
      }
      return parsed as WebchatSession;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<WebchatMessage[]>([]);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const persistSession = useCallback((value: WebchatSession | null) => {
    setSession(value);
    if (!value) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  }, []);

  const pullMessages = useCallback(async (targetSession?: WebchatSession | null) => {
    const activeSession = targetSession ?? session;
    if (!activeSession) return;
    try {
      const data = await fetchWebchatMessages({
        publicKey: activeSession.publicChannelKey,
        customerRef: activeSession.customerRef,
        since: undefined
      });
      setMessages(data.messages);
    } catch (err) {
      if (err instanceof WebchatApiError && err.status === 404) {
        persistSession(null);
        setMessages([]);
        setError("Web 渠道标识无效或已变更，请刷新页面后重试。");
        return;
      }
      throw err;
    }
  }, [session]);

  const ensureSession = useCallback(async () => {
    if (session || connecting) return;
    if (!publicKey) {
      setError("缺少 `k` 参数（publicChannelKey），无法创建会话。");
      return;
    }

    setError("");
    setConnecting(true);
    try {
      const created = await createWebchatSession({
        publicKey,
        client
      });
      persistSession(created);
      setMessages([]);
      await pullMessages(created);
    } catch (err) {
      if (err instanceof WebchatApiError && err.status === 404) {
        setError("找不到对应的 Web 渠道，请检查链接中的 `k` 参数（publicChannelKey）是否正确。");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setConnecting(false);
    }
  }, [connecting, persistSession, publicKey, pullMessages, session]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const tick = async () => {
      try {
        await pullMessages(session);
      } catch (err) {
        if (!cancelled && !(err instanceof WebchatApiError && err.status === 404)) {
          setError((err as Error).message);
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pullMessages, session]);

  useEffect(() => {
    if (session && session.publicChannelKey !== publicKey) {
      persistSession(null);
      setMessages([]);
    }
  }, [publicKey, persistSession, session]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  const onSend = async (payload: { text?: string; attachments?: File[] }) => {
    if (!session) return;

    setError("");
    try {
      const attachments = payload.attachments?.length
        ? await Promise.all(payload.attachments.map((file) => uploadWebchatAttachment({
            publicKey: session.publicChannelKey,
            file
          })))
        : undefined;

      await sendWebchatMessage({
        publicKey: session.publicChannelKey,
        customerRef: session.customerRef,
        text: payload.text,
        attachments,
        client
      });
      await pullMessages(session);
    } catch (err) {
      if (err instanceof WebchatApiError && err.status === 404) {
        persistSession(null);
        setMessages([]);
        setError("当前 Web 渠道不可用（404），请联系管理员检查 `publicChannelKey`。");
      } else {
        setError((err as Error).message);
      }
    }
  };

  if (!session) {
    return (
      <div className="chat-shell centered">
        <section className="join-card">
          <h1>正在连接客服</h1>
          <p>{connecting ? "正在为你创建会话..." : "准备开始聊天..."}</p>
          {!connecting ? (
            <button
              onClick={() => {
                void ensureSession();
              }}
            >
              重试连接
            </button>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      </div>
    );
  }

  return (
    <div className={`chat-shell ${mode === "widget" ? "widget-mode" : ""}`}>
      <section className="chat-card">
        <ChatHeader
          tenantName={session.tenantName}
          tenantSlug={session.tenantSlug}
          customerRef={session.customerRef}
          displayName={session.displayName}
          deviceType={client.deviceType}
        />
        <ChatMessages messages={messages} loading={connecting} />
        <ChatComposer onSend={onSend} disabled={connecting} />
        <footer className="chat-footer">
          <button onClick={() => persistSession(null)}>退出会话</button>
          {error ? <p className="error">{error}</p> : null}
        </footer>
      </section>
    </div>
  );
}
