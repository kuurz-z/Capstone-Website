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
import { API_ORIGIN } from "../api/baseUrl";
import { getFreshToken } from "../api/httpClient";

export default function useChatSocket({
  onMessageNew = null,
  onConversationUpdated = null,
  onTyping = null,
  enabled = true,
} = {}) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);

  // Keep callback refs stable so the effect doesn't re-run on every render
  const onMessageNewRef = useRef(onMessageNew);
  const onConversationUpdatedRef = useRef(onConversationUpdated);
  const onTypingRef = useRef(onTyping);

  useEffect(() => { onMessageNewRef.current = onMessageNew; }, [onMessageNew]);
  useEffect(() => { onConversationUpdatedRef.current = onConversationUpdated; }, [onConversationUpdated]);
  useEffect(() => { onTypingRef.current = onTyping; }, [onTyping]);

  useEffect(() => {
    if (!enabled || !user?.id || !user?.role) return;

    let cancelled = false;

    async function connect() {
      const token = await getFreshToken();
      if (cancelled || !token) return;

      const socket = io(API_ORIGIN, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
      });

      socket.on("connect", () => setIsConnected(true));
      socket.on("disconnect", () => setIsConnected(false));

      socket.on("chat:message-new", (payload = {}) => {
        const { message, conversationId } = payload;
        onMessageNewRef.current?.(message, conversationId);
      });

      socket.on("chat:conversation-updated", (conversation) => {
        onConversationUpdatedRef.current?.(conversation);
      });

      socket.on("chat:typing", (payload) => {
        onTypingRef.current?.(payload);
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
  }, [enabled, user?.id, user?.role]);

  return { isConnected, socket: socketRef };
}
