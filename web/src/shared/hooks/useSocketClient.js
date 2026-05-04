/**
 * SOCKET CLIENT HOOK
 *
 * Manages the Socket.IO client connection lifecycle.
 * Auto-connects when user is authenticated, disconnects on logout, and pushes
 * real-time notifications into the Zustand store.
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import useNotificationStore from "../stores/notificationStore";
import { useAuth } from "./useAuth";
import { API_ORIGIN } from "../api/baseUrl";
import { getFreshToken } from "../api/httpClient";

const SOCKET_URL = API_ORIGIN;

export default function useSocketClient() {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const qc = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setConnected = useNotificationStore((s) => s.setConnected);

  useEffect(() => {
    if (!user?.id || !user?.role) return undefined;
    if (socketRef.current?.connected) return undefined;

    let cancelled = false;

    async function connect() {
      const token = await getFreshToken();
      if (cancelled || !token || socketRef.current?.connected) return;

      const socket = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
      });

      socket.on("connect", () => {
        setConnected(true);
      });

      socket.on("disconnect", () => {
        setConnected(false);
      });

      socket.on("notification:new", (notification) => {
        addNotification(notification);
        if (!notification?.isRead) {
          qc.setQueryData(["notifications", "unread-count"], (current) => ({
            unreadCount: (current?.unreadCount ?? 0) + 1,
          }));
        }
        qc.invalidateQueries({ queryKey: ["notifications"] });
        if (notification?.type === "announcement") {
          qc.invalidateQueries({ queryKey: ["announcements"] });
        }
      });

      socket.on("room:updated", () => {
        qc.invalidateQueries({ queryKey: ["rooms"] });
      });

      socket.on("digital-twin:updated", () => {
        qc.invalidateQueries({ queryKey: ["digital-twin"] });
      });

      socketRef.current = socket;
    }

    connect().catch(() => setConnected(false));

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id, user?.role, addNotification, qc, setConnected]);

  return socketRef.current;
}
