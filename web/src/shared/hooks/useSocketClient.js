/**
 * ============================================================================
 * SOCKET CLIENT HOOK
 * ============================================================================
 *
 * Manages the Socket.IO client connection lifecycle.
 * Auto-connects when user is authenticated, disconnects on logout.
 * Pushes real-time notifications into the Zustand store.
 *
 * USAGE:
 *   // Call once at the app root (e.g., in TenantLayout or AdminLayout)
 *   useSocketClient();
 *
 * ============================================================================
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import useNotificationStore from "../stores/notificationStore";
import useAuth from "./useAuth";
import { API_ORIGIN } from "../api/baseUrl";

const SOCKET_URL = API_ORIGIN;

export default function useSocketClient() {
  const { user, dbUser } = useAuth();
  const socketRef = useRef(null);
  const qc = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setConnected = useNotificationStore((s) => s.setConnected);

  useEffect(() => {
    // Only connect if user is authenticated
    if (!user?.uid || !dbUser?._id) {
      return;
    }

    // Don't reconnect if already connected
    if (socketRef.current?.connected) return;

    const socket = io(SOCKET_URL, {
      auth: {
        userId: dbUser._id,
        role: dbUser.role,
      },
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

    // Listen for real-time notifications
    socket.on("notification:new", (notification) => {
      addNotification(notification);
    });

    // Listen for room availability changes — invalidate rooms cache
    // so all useRooms() queries refetch automatically (TanStack Query)
    socket.on("room:updated", () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
    });

    // Listen for digital twin state changes — invalidate twin cache
    socket.on("digital-twin:updated", () => {
      qc.invalidateQueries({ queryKey: ["digital-twin"] });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.uid, dbUser?._id, dbUser?.role, addNotification, setConnected]);

  return socketRef.current;
}
