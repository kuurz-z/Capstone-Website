/**
 * ============================================================================
 * LILYCREST PUBLIC AI CHATBOT CONTROLLER
 * ============================================================================
 *
 * Handles public visitor inquiries, real-time SSE streaming responses,
 * intelligent lead parsing, and lead escalation to the admin intake pipeline.
 * ============================================================================
 */

import { z } from "zod";
import {
  queryGeminiChatbot,
  streamGeminiChatbot,
} from "../services/chatbot/chatbotService.js";
import {
  parseLeadFromConversation,
} from "../services/chatbot/leadParserService.js";
import {
  streamTenantAssistant as streamTenantAssistantService,
  queryTenantAssistantService,
  escalateTenantAssistantService,
} from "../services/chatbot/tenantAssistantService.js";
import { queryAdminSopService } from "../services/chatbot/adminCopilotService.js";
import { generateAdminReplyDraft } from "../services/chatbot/adminReplyDrafterService.js";
import { detectIssueClusters } from "../services/chatbot/issueClusterService.js";
import { getOwnerSupportTrends } from "../services/chatbot/ownerSupportTrendsService.js";
import { isOwnerRole } from "../config/roles.js";
import Inquiry from "../models/Inquiry.js";

const querySchema = z.object({
  message: z.string().min(1, "Message is required").max(1000).trim(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "model"]),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(50, "Conversation history is too long")
    .default([]),
  branchFocus: z.enum(["all", "gil_puyat", "guadalupe"]).default("all").optional(),
});

const parseLeadSchema = z.object({
  message: z.string().max(2000).optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.string(),
        text: z.string(),
      }),
    )
    .optional(),
  branchFocus: z.enum(["all", "gil_puyat", "guadalupe"]).default("all").optional(),
});

const escalationSchema = z.object({
  name: z.string().min(1, "Name is required").max(150).trim(),
  fullName: z.string().max(150).trim().optional(),
  email: z
    .string()
    .email("Invalid email format")
    .min(1, "Email is required")
    .trim()
    .toLowerCase(),
  phone: z.string().min(1, "Phone number is required").max(25).trim(),
  contactNumber: z.string().max(25).trim().optional(),
  preferredBranch: z
    .enum(["gil_puyat", "gil-puyat", "guadalupe", "general", "any", "all"])
    .nullable()
    .optional(),
  branch: z
    .enum(["gil_puyat", "gil-puyat", "guadalupe", "general", "any", "all"])
    .nullable()
    .optional(),
  message: z.string().min(1, "Message is required").max(5000).trim(),
  preferredRoomType: z
    .string()
    .max(100)
    .nullable()
    .optional(),
  concernCategory: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  targetMoveInDate: z.string().nullable().optional(),
  expectedLengthOfStay: z.string().nullable().optional(),
  preferredViewingDate: z.string().nullable().optional(),
  chatContext: z.string().max(10000).optional(),
  source: z.string().max(100).default("chatbot_front_desk_request").optional(),
});

const tenantEscalationSchema = z.object({
  category: z.string().max(100).default("General Inquiry"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  summary: z.string().min(1, "Summary is required").max(2000).trim(),
  lastBotMessage: z.string().max(2000).optional(),
});

/**
 * Standard REST query endpoint for public chatbot responses.
 */
export const handlePublicQuery = async (req, res, next) => {
  try {
    const { message, conversationHistory, branchFocus } = querySchema.parse(req.body);
    const data = await queryGeminiChatbot(message, conversationHistory, branchFocus || "all");
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    next(error);
  }
};

/**
 * Server-Sent Events (SSE) streaming endpoint for real-time token delivery and rich widgets.
 */
export const handlePublicStream = async (req, res, next) => {
  let validatedData;
  try {
    validatedData = querySchema.parse(req.body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    return next(error);
  }

  // Set SSE streaming headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const abortController = new AbortController();
  req.on("close", () => {
    abortController.abort();
  });

  const sendEvent = (event, payload) => {
    if (res.writableEnded || res.closed) return;
    res.write(`data: ${JSON.stringify({ event, ...payload })}\n\n`);
  };

  try {
    await streamGeminiChatbot({
      message: validatedData.message,
      conversationHistory: validatedData.conversationHistory,
      branchFocus: validatedData.branchFocus || "all",
      signal: abortController.signal,
      onToken: (token) => {
        sendEvent("token", { data: token, token, text: token });
      },
      onWidget: (widget) => {
        sendEvent("widget", { data: widget, widget, richWidgets: [widget] });
      },
      onActions: (actions) => {
        sendEvent("actions", { data: actions, actions, suggestedActions: actions });
      },
      onDone: (result) => {
        sendEvent("done", { data: result, done: true, ...(result || {}) });
        if (!res.writableEnded) {
          res.end();
        }
      },
      onError: (err) => {
        const errorMsg = err?.message || "Streaming failed";
        sendEvent("error", { error: errorMsg, message: errorMsg, data: { error: errorMsg } });
        if (!res.writableEnded) {
          res.end();
        }
      },
    });
  } catch (streamError) {
    if (!res.writableEnded) {
      const errorMsg = streamError?.message || "Streaming failed";
      sendEvent("error", { error: errorMsg, message: errorMsg, data: { error: errorMsg } });
      res.end();
    }
  }
};

/**
 * Intelligent Lead & Form Parsing endpoint.
 * Analyzes conversation history and extracts structured visitor lead data.
 */
export const handleParseLead = async (req, res, next) => {
  try {
    const { message, conversationHistory, branchFocus } = parseLeadSchema.parse(req.body);
    const input =
      conversationHistory && conversationHistory.length > 0
        ? conversationHistory
        : message || "";
    const parsedData = await parseLeadFromConversation(input, branchFocus || "all");
    res.status(200).json({ success: true, data: parsedData });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    next(error);
  }
};

/**
 * Lead escalation endpoint for transferring chatbot conversations to the admin inquiry queue.
 */
export const handleLeadEscalation = async (req, res, next) => {
  try {
    const validatedData = escalationSchema.parse(req.body);

    const clientName = (validatedData.fullName || validatedData.name).trim();
    const clientPhone = (validatedData.contactNumber || validatedData.phone).trim();
    const rawBranch = validatedData.preferredBranch || validatedData.branch;

    let normalizedBranch = null;
    if (rawBranch === "gil_puyat" || rawBranch === "gil-puyat") {
      normalizedBranch = "gil-puyat";
    } else if (rawBranch === "guadalupe") {
      normalizedBranch = "guadalupe";
    } else if (rawBranch === "general") {
      normalizedBranch = "general";
    }

    const categoryLabel = validatedData.concernCategory || validatedData.category;
    let subject = "Chatbot: Front Desk Assistance";
    if (categoryLabel) {
      const formattedCategory = categoryLabel
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      subject = `Chatbot: ${formattedCategory}`;
    }

    let inquiryNotes = "";
    if (validatedData.chatContext) {
      inquiryNotes = `Chatbot Conversation Context:\n${validatedData.chatContext}`;
    }

    const inquiryPayload = {
      fullName: clientName,
      name: clientName,
      email: validatedData.email,
      contactNumber: clientPhone,
      phone: clientPhone,
      preferredBranch: normalizedBranch,
      branch: normalizedBranch,
      subject,
      message: validatedData.message,
      notes: inquiryNotes,
      status: "pending",
      preferredRoomType:
        validatedData.preferredRoomType && validatedData.preferredRoomType !== "undecided"
          ? validatedData.preferredRoomType
          : null,
      source: "website",
      sourceNote: validatedData.source || "chatbot_front_desk_request",
      viewingStatus: validatedData.preferredViewingDate ? "viewing_scheduled" : "new",
      priority: "medium",
    };

    if (validatedData.expectedLengthOfStay) {
      const parsedLength = parseInt(validatedData.expectedLengthOfStay, 10);
      if (!isNaN(parsedLength) && parsedLength > 0) {
        inquiryPayload.expectedLengthOfStay = parsedLength;
      }
    }

    if (validatedData.targetMoveInDate) {
      const parsedDate = new Date(validatedData.targetMoveInDate);
      if (!isNaN(parsedDate.getTime())) {
        inquiryPayload.targetMoveInDate = parsedDate;
      }
    }

    const newInquiry = new Inquiry(inquiryPayload);
    await newInquiry.save();

    res.status(200).json({
      success: true,
      data: {
        inquiryId: newInquiry._id,
        message:
          "Your assistance request has been sent to our front desk admin team. We will contact you promptly.",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    next(error);
  }
};

/**
 * Tenant-authenticated REST query endpoint.
 */
export const handleTenantQuery = async (req, res, next) => {
  try {
    const { message, conversationHistory } = querySchema.parse(req.body);
    const userId = req.authUser?._id || req.user?.mongoId || req.user?.uid;
    const data = await queryTenantAssistantService({
      userId,
      message,
      conversationHistory,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    next(error);
  }
};

/**
 * Tenant-authenticated SSE streaming endpoint.
 */
export const handleTenantStream = async (req, res, next) => {
  let validatedData;
  try {
    validatedData = querySchema.parse(req.body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    return next(error);
  }

  const userId = req.authUser?._id || req.user?.mongoId || req.user?.uid;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const abortController = new AbortController();
  req.on("close", () => {
    abortController.abort();
  });

  const sendEvent = (event, payload) => {
    if (res.writableEnded || res.closed) return;
    res.write(`data: ${JSON.stringify({ event, ...payload })}\n\n`);
  };

  try {
    await streamTenantAssistantService({
      userId,
      message: validatedData.message,
      conversationHistory: validatedData.conversationHistory,
      signal: abortController.signal,
      onToken: (token) => {
        sendEvent("token", { data: token, token, text: token });
      },
      onWidget: (widget) => {
        sendEvent("widget", { data: widget, widget, richWidgets: [widget] });
      },
      onActions: (actions) => {
        sendEvent("actions", { data: actions, actions, suggestedActions: actions });
      },
      onDone: (result) => {
        sendEvent("done", { data: result, done: true, ...(result || {}) });
        if (!res.writableEnded) {
          res.end();
        }
      },
      onError: (err) => {
        const errorMsg = err?.message || "Streaming failed";
        sendEvent("error", { error: errorMsg, message: errorMsg, data: { error: errorMsg } });
        if (!res.writableEnded) {
          res.end();
        }
      },
    });
  } catch (streamError) {
    if (!res.writableEnded) {
      const errorMsg = streamError?.message || "Streaming failed";
      sendEvent("error", { error: errorMsg, message: errorMsg, data: { error: errorMsg } });
      res.end();
    }
  }
};

/**
 * Tenant escalation to branch admin.
 */
export const handleTenantEscalate = async (req, res, next) => {
  try {
    const validatedData = tenantEscalationSchema.parse(req.body);
    const userId = req.authUser?._id || req.user?.mongoId || req.user?.uid;
    const result = await escalateTenantAssistantService({
      userId,
      category: validatedData.category,
      priority: validatedData.priority,
      summary: validatedData.summary,
      lastBotMessage: validatedData.lastBotMessage,
    });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.issues ? error.issues[0].message : "Validation Error",
      });
    }
    next(error);
  }
};

/**
 * Handle Admin SOP Query
 */
export const handleAdminSopQuery = async (req, res, next) => {
  try {
    const { query, branch } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: "Query is required" });
    }
    const rawRole = req.authUser?.role || req.user?.role || "branch_admin";
    const isOwner = isOwnerRole(rawRole);
    const userRole = isOwner ? "owner" : "branch_admin";
    const resolvedBranch = isOwner
      ? (branch || "all")
      : (req.branchFilter || req.authUser?.branch || "all");
    const result = await queryAdminSopService({ query, branch: resolvedBranch, userRole });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Admin Suggest Reply
 */
export const handleAdminSuggestReply = async (req, res, next) => {
  try {
    const { conversationId, ticketCategory, urgency, recentMessages, tenantContext, tone } = req.body;
    const branch = req.branchFilter || req.body.branch;
    const result = await generateAdminReplyDraft({ conversationId, ticketCategory, urgency, recentMessages, tenantContext, tone, branch });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Admin Issue Clusters
 */
export const handleAdminIssueClusters = async (req, res, next) => {
  try {
    const { branch, timeframeHours } = req.query;
    const resolvedBranch = req.branchFilter || branch;
    const result = await detectIssueClusters({ branch: resolvedBranch, timeframeHours: timeframeHours ? parseInt(timeframeHours) : 24 });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

import { generateDailyShiftBriefing } from "../services/chatbot/adminDailyBriefingService.js";
import { getAdminDynamicSuggestions } from "../services/chatbot/adminDynamicSuggestionsService.js";

/**
 * Handle Owner Support Trends
 */
export const handleOwnerSupportTrends = async (req, res, next) => {
  try {
    const { timeframe, branch } = req.query;
    const result = await getOwnerSupportTrends({ timeframe, branch });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Admin Daily Shift Briefing
 */
export const handleAdminDailyBriefing = async (req, res, next) => {
  try {
    const rawRole = req.authUser?.role || req.user?.role || "branch_admin";
    const isOwner = isOwnerRole(rawRole);
    const userRole = isOwner ? "owner" : "branch_admin";
    const branch = isOwner
      ? (req.query.branch || "all")
      : (req.branchFilter || req.authUser?.branch || "all");
    const result = await generateDailyShiftBriefing({ branch, userRole });
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle Admin Dynamic Contextual Suggestions
 */
export const handleAdminDynamicSuggestions = async (req, res, next) => {
  try {
    const rawRole = req.authUser?.role || req.user?.role || "branch_admin";
    const isOwner = isOwnerRole(rawRole);
    const userRole = isOwner ? "owner" : "branch_admin";
    const branch = isOwner
      ? (req.query.branch || "all")
      : (req.branchFilter || req.authUser?.branch || "all");
    const result = await getAdminDynamicSuggestions({ branch, userRole });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};


