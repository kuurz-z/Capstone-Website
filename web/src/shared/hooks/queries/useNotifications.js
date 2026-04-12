/**
 * ============================================================================
 * NOTIFICATION QUERY HOOKS (TanStack Query)
 * ============================================================================
 *
 * Custom hooks for fetching and mutating notifications.
 * Uses the same pattern as useReservations.js, useBilling.js, etc.
 *
 * Hooks:
 *   useNotifications(page, options)  — paginated notification list
 *   useUnreadCount()                  — unread badge count
 *   useMarkAsRead()                   — mark single as read (mutation)
 *   useMarkAllAsRead()                — mark all as read (mutation)
 *
 * ============================================================================
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationApi } from "../../api/notificationApi";
import useNotificationStore from "../../stores/notificationStore";

// ── Query Keys ──
const KEYS = {
  all: ["notifications"],
  list: (page, limit, unreadOnly) => [
    "notifications",
    "list",
    page,
    limit,
    unreadOnly,
  ],
  unread: ["notifications", "unread-count"],
};

/**
 * Fetch paginated notifications
 * @param {number} page - Page number (1-based)
 * @param {Object} options - { limit, unreadOnly, enabled }
 */
export const useNotifications = (page = 1, options = {}) => {
  const { limit = 20, unreadOnly = false, enabled = true } = options;

  return useQuery({
    queryKey: KEYS.list(page, limit, unreadOnly),
    queryFn: () => notificationApi.getAll({ page, limit, unreadOnly }),
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every 60s
  });
};

/**
 * Fetch unread notification count (for badge)
 */
export const useUnreadCount = (enabled = true) => {
  return useQuery({
    queryKey: KEYS.unread,
    queryFn: () => notificationApi.getUnreadCount(),
    enabled,
    staleTime: 15 * 1000, // 15 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30s
  });
};

/**
 * Mark a single notification as read
 */
export const useMarkAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId) => notificationApi.markAsRead(notificationId),
    onSuccess: (_, notificationId) => {
      useNotificationStore.getState().markAsRead(notificationId);
      queryClient.setQueryData(KEYS.unread, (current) => ({
        unreadCount: Math.max(0, (current?.unreadCount ?? 0) - 1),
      }));
      // Invalidate both the list and the unread count
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.invalidateQueries({ queryKey: KEYS.unread });
    },
  });
};

/**
 * Mark all notifications as read
 */
export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      useNotificationStore.getState().markAllAsRead();
      queryClient.setQueryData(KEYS.unread, { unreadCount: 0 });
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.invalidateQueries({ queryKey: KEYS.unread });
    },
  });
};
