import { authFetch, protectedFetch } from "./httpClient.js";

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

  sendAdminMessage: (conversationId, message, attachments = []) =>
    authFetch(`/chat/admin/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message, attachments }),
    }),

  uploadAttachment: async (conversationId, file) => {
    const body = new FormData();
    body.append("file", file);
    return authFetch(`/chat/admin/conversations/${conversationId}/attachments`, {
      method: "POST",
      body,
    });
  },

  getAttachmentBlob: async (attachment) => {
    const url = attachment?.url || attachment?.fileUrl;
    if (!String(url || "").startsWith("/chat/")) {
      throw new Error("Invalid chat attachment URL.");
    }
    const response = await protectedFetch(url);
    if (!response.ok) throw new Error("Unable to download attachment.");
    return response.blob();
  },

  markAdminRead: (conversationId) =>
    authFetch(`/chat/admin/conversations/${conversationId}/read`, {
      method: "PATCH",
    }),

  assignConversation: (conversationId, assignedAdminId = "me") =>
    authFetch(`/chat/admin/conversations/${conversationId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assignedAdminId }),
    }),

  updateStatus: (conversationId, status, note = "", identity = {}) =>
    authFetch(`/chat/admin/conversations/${conversationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note, ...(identity.requestId ? { requestId: identity.requestId, revision: identity.revision } : {}) }),
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

  // Tenant / Mobile-compatible methods
  getMyConversations: () =>
    authFetch("/chat/me"),

  getTenantMessages: (conversationId) =>
    authFetch(`/chat/${conversationId}/messages`),

  getConversationMessages: (conversationId) =>
    authFetch(`/chat/${conversationId}/messages`),

  sendTenantMessage: (conversationId, message, attachments = []) =>
    authFetch(`/chat/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message, attachments }),
    }),

  uploadTenantAttachment: async (conversationId, file) => {
    const body = new FormData();
    body.append("file", file);
    return authFetch(`/chat/${conversationId}/attachments`, {
      method: "POST",
      body,
    });
  },

  startConversation: (payload) =>
    authFetch("/chat/start", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  closeTenantConversation: (conversationId, note = "") =>
    authFetch(`/chat/${conversationId}/close`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),

  confirmTenantResolution: (conversationId, resolved, note = "", rating = null, feedback = "") =>
    authFetch(`/chat/${conversationId}/resolution`, {
      method: "PATCH",
      body: JSON.stringify({ resolved, note, rating, feedback }),
    }),

  reopenTenantConversation: (conversationId, note = "") =>
    authFetch(`/chat/${conversationId}/reopen`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }),

  // Fire-and-forget typing signal — no await needed at call site.
  broadcastTyping: (conversationId) =>
    authFetch(`/chat/${conversationId}/typing`, { method: "POST" }).catch(() => {}),
};
