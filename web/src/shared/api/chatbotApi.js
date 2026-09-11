/**
 * =============================================================================
 * CHATBOT API - Public Visitor & Applicant Lilycrest AI Chatbot
 * =============================================================================
 *
 * Public HTTP and SSE streaming client methods for communicating with the Lilycrest AI Chatbot.
 * Routes through the public rate-limited backend endpoints:
 *   - POST /api/chatbot/public/stream (SSE token streaming + rich widgets)
 *   - POST /api/chatbot/public/query (non-streaming legacy query)
 *   - POST /api/chatbot/public/lead-escalation (tour booking & staff escalation)
 *
 * =============================================================================
 */

import { publicFetch, authFetch } from "./httpClient.js";
import { API_BASE_URL } from "./baseUrl.js";

/**
 * Stream conversational reply with SSE from the public Lilycrest AI Chatbot.
 *
 * @param {Object} payload
 * @param {string} payload.message - User query text
 * @param {Array<{role: string, text: string}>} [payload.conversationHistory=[]] - Previous conversation turns
 * @param {string} [payload.branchFocus="all"] - Optional branch filter ("gil_puyat" | "guadalupe" | "all")
 * @param {(token: string, accumulatedText: string) => void} [payload.onToken] - Invoked on each text token received
 * @param {(widget: Object) => void} [payload.onWidget] - Invoked when rich interactive widget payload is emitted
 * @param {(actions: Array<Object>) => void} [payload.onActions] - Invoked when suggested action pills are emitted
 * @param {(result: { text: string, widget: Object|null, actions: Array<Object>|null }) => void} [payload.onDone] - Invoked when stream completes
 * @param {(error: Error) => void} [payload.onError] - Invoked on stream failure
 * @param {AbortSignal} [payload.signal] - Optional abort controller signal
 * @returns {Promise<{text: string, widget: Object|null, actions: Array<Object>|null}>}
 */
export const streamPublicChatbot = async ({
  message,
  conversationHistory = [],
  branchFocus = "all",
  onToken,
  onWidget,
  onActions,
  onDone,
  onError,
  signal,
}) => {
  let accumulatedText = "";
  let emittedWidget = null;
  let emittedActions = null;

  try {
    const response = await fetch(`${API_BASE_URL}/chatbot/public/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message: message?.trim() || "",
        conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
        branchFocus: branchFocus || "all",
      }),
      signal,
    });

    if (!response.ok) {
      let errPayload;
      try {
        errPayload = await response.json();
      } catch {
        errPayload = { message: response.statusText || "Streaming request failed" };
      }
      const err = new Error(errPayload?.message || `HTTP ${response.status}: Failed to stream response`);
      if (onError) onError(err);
      throw err;
    }

    if (!response.body) {
      throw new Error("ReadableStream not supported by browser or empty response body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const processParsedData = (data) => {
      if (!data || typeof data !== "object") return null;

      // 1. Structured event envelope handling ({ event, data, ... })
      if (data.event) {
        if (data.event === "token") {
          const token = data.data ?? data.token ?? data.text ?? data.delta ?? "";
          if (token) {
            accumulatedText += token;
            if (onToken) onToken(token, accumulatedText);
          }
          return null;
        }

        if (data.event === "widget") {
          const w = data.data ?? data.widget ?? data.richWidgets;
          if (w) {
            emittedWidget = w;
            if (onWidget) onWidget(w);
          }
          return null;
        }

        if (data.event === "actions") {
          const acts = data.data ?? data.actions ?? data.suggestedActions;
          if (acts) {
            emittedActions = acts;
            if (onActions) onActions(acts);
          }
          return null;
        }

        if (data.event === "error") {
          const errMsg = data.message || data.error || data.data?.error || "Streaming failed";
          const streamErr = new Error(errMsg);
          if (onError) onError(streamErr);
          return null;
        }

        if (data.event === "done") {
          if (data.data?.fullReply && !accumulatedText) {
            accumulatedText = data.data.fullReply;
          }
          if (data.data?.widget && !emittedWidget) {
            emittedWidget = data.data.widget;
          }
          if (data.data?.suggestedActions && !emittedActions) {
            emittedActions = data.data.suggestedActions;
          }
          const finalResult = { text: accumulatedText, widget: emittedWidget, actions: emittedActions };
          if (onDone) onDone(finalResult);
          return finalResult;
        }
      }

      // 2. Direct property payload handling ({ token, widget, actions, done, error })
      if (data.token !== undefined || data.delta !== undefined || data.text !== undefined) {
        const token = data.token ?? data.delta ?? data.text;
        if (token) {
          accumulatedText += token;
          if (onToken) onToken(token, accumulatedText);
        }
      }

      if (data.widget || data.richWidgets) {
        const w = data.widget || data.richWidgets;
        emittedWidget = w;
        if (onWidget) onWidget(w);
      }

      if (data.actions || data.suggestedActions) {
        const acts = data.actions || data.suggestedActions;
        emittedActions = acts;
        if (onActions) onActions(acts);
      }

      if (data.error) {
        const streamErr = new Error(data.error);
        if (onError) onError(streamErr);
      }

      if (data.done) {
        const finalResult = { text: accumulatedText, widget: emittedWidget, actions: emittedActions };
        if (onDone) onDone(finalResult);
        return finalResult;
      }

      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || ""; // keep tail partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue; // skip keep-alive comments or empty lines

        if (trimmed.startsWith("data:")) {
          const jsonString = trimmed.replace(/^data:\s*/, "").trim();
          if (jsonString === "[DONE]") {
            const finalResult = { text: accumulatedText, widget: emittedWidget, actions: emittedActions };
            if (onDone) onDone(finalResult);
            return finalResult;
          }

          try {
            const data = JSON.parse(jsonString);
            const maybeResult = processParsedData(data);
            if (maybeResult) return maybeResult;
          } catch (parseErr) {
            console.warn("Unable to parse SSE event data:", jsonString, parseErr);
          }
        }
      }
    }

    // Flush any leftover in buffer
    if (buffer.trim().startsWith("data:")) {
      try {
        const jsonString = buffer.trim().replace(/^data:\s*/, "").trim();
        if (jsonString !== "[DONE]") {
          const data = JSON.parse(jsonString);
          const maybeResult = processParsedData(data);
          if (maybeResult) return maybeResult;
        }
      } catch {
        // Ignore trailing partial parse errors
      }
    }

    const result = { text: accumulatedText, widget: emittedWidget, actions: emittedActions };
    if (onDone) onDone(result);
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      // Graceful client cancellation
      return { text: accumulatedText, widget: emittedWidget, actions: emittedActions, aborted: true };
    }
    if (onError) onError(error);
    throw error;
  }
};

/**
 * Query the public conversational Lilycrest AI Chatbot (legacy non-streaming endpoint).
 *
 * @param {Object} payload
 * @param {string} payload.message - User query text
 * @param {Array<{role: string, text: string}>} [payload.conversationHistory=[]] - Previous conversation turns
 * @param {string} [payload.branchFocus="all"] - Optional branch filter ("gil_puyat" | "guadalupe" | "all")
 * @returns {Promise<{reply: string, suggestedActions?: Array<{label: string, url?: string, action?: string, prompt?: string}>, canEscalate?: boolean}>}
 */
export const queryPublicChatbot = async ({ message, conversationHistory = [], branchFocus = "all" }) => {
  return publicFetch("/chatbot/public/query", {
    method: "POST",
    body: JSON.stringify({
      message: message?.trim() || "",
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      branchFocus,
    }),
  });
};

/**
 * Escalate an unresolved chatbot conversation to the Admin Inquiry lead pipeline.
 *
 * @param {Object} leadData
 * @param {string} leadData.name - Full name of the prospective tenant
 * @param {string} leadData.email - Contact email
 * @param {string} leadData.phone - Contact phone number
 * @param {string} leadData.preferredBranch - "gil_puyat" | "guadalupe" | "any"
 * @param {string} [leadData.preferredRoomType] - Room type preference
 * @param {string} [leadData.message] - Inquiry notes or question context
 * @param {string} [leadData.source="chatbot_public"] - Tracking source
 * @returns {Promise<{inquiryId: string, message: string}>}
 */
export const escalateChatbotLead = async (leadData) => {
  const normalizedName = (leadData?.name || leadData?.fullName || "").trim();
  const normalizedEmail = (leadData?.email || "").trim().toLowerCase();
  const normalizedPhone = (leadData?.phone || leadData?.contactNumber || "").trim();
  const normalizedBranch = leadData?.preferredBranch || leadData?.branch || "any";
  const normalizedRoomType = leadData?.preferredRoomType || "undecided";
  const normalizedCategory = leadData?.concernCategory || leadData?.category || "General Inquiry";
  const normalizedMessage = (leadData?.message || "").trim();
  const normalizedSource = leadData?.source || "chatbot_front_desk_request";

  const response = await publicFetch("/chatbot/public/lead-escalation", {
    method: "POST",
    body: JSON.stringify({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      preferredBranch: normalizedBranch,
      preferredRoomType: normalizedRoomType,
      concernCategory: normalizedCategory,
      message: normalizedMessage,
      source: normalizedSource,
    }),
  });

  if (response && typeof response === "object") {
    const inquiryId = response?.data?.inquiryId || response?.inquiryId || response?._id;
    const message = response?.data?.message || response?.message || "Your assistance request has been sent to our front desk admin team. We will contact you promptly.";
    return {
      success: response?.success !== false,
      data: response?.data || response,
      inquiryId,
      message,
    };
  }

  return response;
};

/**
 * Backward compatibility alias for legacy callers and cached client bundles.
 */
export const escalateToHuman = escalateChatbotLead;

/**
 * Parse structured lead details (name, email, phone, room, branch) from conversation history.
 *
 * @param {Object} payload
 * @param {Array<{role: string, text: string}>} [payload.conversationHistory=[]]
 * @param {string} [payload.message=""]
 * @param {string} [payload.branchFocus="all"]
 * @returns {Promise<Object>}
 */
export const parseChatbotLead = async ({ conversationHistory = [], message = "", branchFocus = "all" }) => {
  return publicFetch("/chatbot/public/parse-lead", {
    method: "POST",
    body: JSON.stringify({
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      message: message?.trim() || "",
      branchFocus,
    }),
  });
};

/**
 * Query the Admin SOP Copilot Assistant.
 *
 * @param {Object} payload
 * @param {string} payload.query - Policy query text
 * @param {string} [payload.branch] - Branch scoping
 * @returns {Promise<Object>}
 */
export const queryAdminSop = async ({ query, branch }) => {
  return authFetch("/chatbot/admin/sop-query", {
    method: "POST",
    body: JSON.stringify({
      query: query?.trim() || "",
      branch,
    }),
  });
};

export const queryAdminAssistant = queryAdminSop;
export const queryAdminCopilot = queryAdminSop;


/**
 * Request an AI reply draft for admin chat or inquiry conversations.
 *
 * @param {Object} payload
 * @param {string} [payload.conversationId]
 * @param {string} [payload.ticketCategory]
 * @param {string} [payload.urgency]
 * @param {Array<{senderRole: string, message: string}>} [payload.recentMessages]
 * @param {Object} [payload.tenantContext]
 * @param {string} [payload.tone="Formal"]
 * @param {string} [payload.branch]
 * @returns {Promise<Object>}
 */
export const suggestAdminReply = async (payload) => {
  return authFetch("/chatbot/admin/suggest-reply", {
    method: "POST",
    body: JSON.stringify({
      conversationId: payload.conversationId,
      ticketCategory: payload.ticketCategory || "general_inquiry",
      urgency: payload.urgency || "normal",
      recentMessages: payload.recentMessages || [],
      tenantContext: payload.tenantContext,
      tone: payload.tone || "Formal",
      branch: payload.branch,
    }),
  });
};

/**
 * Fetch detected issue clusters for branch admins.
 *
 * @param {Object} [params]
 * @param {string} [params.branch]
 * @param {number} [params.timeframeHours=24]
 * @returns {Promise<Object>}
 */
export const getAdminIssueClusters = async ({ branch, timeframeHours = 24 } = {}) => {
  const queryParams = new URLSearchParams();
  if (branch) queryParams.set("branch", branch);
  if (timeframeHours) queryParams.set("timeframeHours", String(timeframeHours));
  const qs = queryParams.toString();
  return authFetch(`/chatbot/admin/issue-clusters${qs ? `?${qs}` : ""}`);
};

/**
 * Fetch cross-branch support trends and executive memo for dorm owners.
 *
 * @param {Object} [params]
 * @param {string} [params.timeframe="30d"]
 * @param {string} [params.branch="All"]
 * @returns {Promise<Object>}
 */
export const getOwnerSupportTrends = async ({ timeframe = "30d", branch = "All" } = {}) => {
  const queryParams = new URLSearchParams();
  if (timeframe) queryParams.set("timeframe", timeframe);
  if (branch) queryParams.set("branch", branch);
  const qs = queryParams.toString();
  return authFetch(`/chatbot/owner/support-trends${qs ? `?${qs}` : ""}`);
};

/**
 * Fetch dynamic, context-aware suggestions for branch admins.
 *
 * @param {Object} [params]
 * @param {string} [params.branch]
 * @returns {Promise<Object>}
 */
export const getAdminDynamicSuggestions = async ({ branch } = {}) => {
  const queryParams = new URLSearchParams();
  if (branch) queryParams.set("branch", branch);
  const qs = queryParams.toString();
  return authFetch(`/chatbot/admin/dynamic-suggestions${qs ? `?${qs}` : ""}`);
};

export const chatbotApi = {
  streamPublicChatbot,
  queryPublicChatbot,
  escalateChatbotLead,
  escalateToHuman,
  parseChatbotLead,
  queryAdminSop,
  suggestAdminReply,
  getAdminIssueClusters,
  getOwnerSupportTrends,
  getAdminDynamicSuggestions,
};

export default chatbotApi;


