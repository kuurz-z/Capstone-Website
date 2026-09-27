/**
 * useChatSocket
 *
 * Dedicated Socket.IO subscription for the admin chat workspace.
 * Connects only while the chat page is mounted; disconnects on unmount.
 * Does not share or interfere with the layout-level socket in useSocketClient.
 *
 * Events handled:
 *   chat:message-new          → onMessageNew(message, conversationId)
 *   chat:conversation-updated → onConversationUpdated(conversation)
 *   chat:typing               → onTyping({ conversationId, senderRole, senderName })
 *
 * Usage:
 *   const { isConnected } = useChatSocket({
 *     onMessageNew: (msg, convId) => { ... },
 *     onConversationUpdated: (conv) => { ... },
 *   });
 */

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./useAuth";
import { SOCKET_BASE_URL } from "../api/baseUrl";
import {
  SOCKET_CLIENT_OPTIONS,
  describeSocketTarget,
} from "../api/socketConfig";
import { getFreshToken } from "../api/httpClient";
import { getDeviceId, getSessionId } from "../api/authSession";

export default function useChatSocket({
  onMessageNew = null,
  onNewMessage = null,
  onConversationUpdated = null,
  onTyping = null,
  onMessagesRead = null,
  enabled = true,
} = {}) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const lastSocketErrorRef = useRef("");
  const hasLoggedConnectionRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  // Keep callback refs stable so the effect doesn't re-run on every render
  const onMessageNewRef = useRef(onMessageNew);
  const onNewMessageRef = useRef(onNewMessage);
  const onConversationUpdatedRef = useRef(onConversationUpdated);
  const onTypingRef = useRef(onTyping);
  const onMessagesReadRef = useRef(onMessagesRead);

  useEffect(() => { onMessageNewRef.current = onMessageNew; }, [onMessageNew]);
  useEffect(() => { onNewMessageRef.current = onNewMessage; }, [onNewMessage]);
  useEffect(() => { onConversationUpdatedRef.current = onConversationUpdated; }, [onConversationUpdated]);
  useEffect(() => { onTypingRef.current = onTyping; }, [onTyping]);
  useEffect(() => { onMessagesReadRef.current = onMessagesRead; }, [onMessagesRead]);

  const userId = user?._id || user?.id || user?.userId || user?.uid;

  useEffect(() => {
    if (!enabled || !userId || !user?.role) return;

    let cancelled = false;

    async function connect() {
      const token = await getFreshToken();
      if (cancelled || !token) return;

      const socket = io(SOCKET_BASE_URL, {
        auth: { token, deviceId: getDeviceId(), sessionId: getSessionId() },
        ...SOCKET_CLIENT_OPTIONS,
      });

      socket.on("connect", () => {
        lastSocketErrorRef.current = "";
        setIsConnected(true);
        const transport = socket.io.engine?.transport?.name || "unknown";
        if (!hasLoggedConnectionRef.current) {
          hasLoggedConnectionRef.current = true;
          console.info(`[socket] Chat connected to real-time server (${transport}).`);
        }
        socket.io.engine?.once("upgrade", (upgradedTransport) => {
          console.info(`[socket] Chat transport upgraded to ${upgradedTransport.name}.`);
        });
      });
      socket.on("disconnect", (reason) => {
        setIsConnected(false);
        if (reason !== "io client disconnect") {
          console.info(`[socket] Chat disconnected (${reason || "unknown reason"}). HTTP loading is unaffected.`);
        }
      });

      socket.on("connect_error", (error) => {
        setIsConnected(false);
        const message = error?.message || "connection failed";
        if (lastSocketErrorRef.current !== message) {
          lastSocketErrorRef.current = message;
          console.warn(
            `[socket] Chat real-time connection unavailable (${message}). Target: ${describeSocketTarget()}. Chat HTTP loading is unaffected.`,
          );
        }
      });

      socket.on("reconnect_failed", () => {
        setIsConnected(false);
        console.warn("[socket] Chat real-time reconnect attempts exhausted.");
      });

      socket.on("chat:message-new", (payload = {}) => {
        const { message, conversationId } = payload;
        onMessageNewRef.current?.(message, conversationId);
        onNewMessageRef.current?.({ ...payload, message, conversationId });
      });

      socket.on("chat:conversation-updated", (conversation) => {
        onConversationUpdatedRef.current?.(conversation);
      });

      socket.on("chat:typing", (payload) => {
        onTypingRef.current?.(payload);
      });

      socket.on("chat:messages-read", (payload = {}) => {
        onMessagesReadRef.current?.(payload);
      });

      socketRef.current = socket;
    }

    connect().catch(() => setIsConnected(false));

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, userId, user?.role]);

  return { isConnected, socket: socketRef };
}
