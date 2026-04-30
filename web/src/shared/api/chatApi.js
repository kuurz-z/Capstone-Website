import { authFetch } from "./httpClient.js";

const buildQuery = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "all") {
      return;
    }
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const chatApi = {
  getAdminConversations: (filters = {}) =>
    authFetch(`/chat/admin/conversations${buildQuery(filters)}`),

  getAdminMessages: (conversationId) =>
    authFetch(`/chat/admin/conversations/${conversationId}/messages`),

  sendAdminMessage: (conversationId, message) =>
    authFetch(`/chat/admin/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  markAdminRead: (conversationId) =>
    authFetch(`/chat/admin/conversations/${conversationId}/read`, {
      method: "PATCH",
    }),

  assignConversation: (conversationId, assignedAdminId = "me") =>
    authFetch(`/chat/admin/conversations/${conversationId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assignedAdminId }),
    }),

  updateStatus: (conversationId, status, note = "") =>
    authFetch(`/chat/admin/conversations/${conversationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    }),

  updatePriority: (conversationId, priority) =>
    authFetch(`/chat/admin/conversations/${conversationId}/priority`, {
      method: "PATCH",
      body: JSON.stringify({ priority }),
    }),

  closeConversation: (conversationId, note) =>
    authFetch(`/chat/admin/conversations/${conversationId}/close`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),

  // Fire-and-forget typing signal — no await needed at call site.
  broadcastTyping: (conversationId) =>
    authFetch(`/chat/${conversationId}/typing`, { method: "POST" }).catch(() => {}),
};
