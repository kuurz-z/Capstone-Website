/**
 * Joi/manual validation schemas for specific routes.
 * Used with the `validate()` middleware helper.
 */

import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_TARGET_BRANCHES,
} from "../config/announcements.js";

/**
 * Schema for POST /api/auth/set-role
 * Body: { userId, role }
 */
export const setRoleSchema = {
  userId: { type: "string", required: true },
  role: {
    type: "string",
    required: true,
    enum: ["applicant", "tenant", "branch_admin", "owner"],
  },
};

/**
 * Schema for PATCH /api/auth/update-branch
 * Body: { branch }
 */
export const updateBranchSchema = {
  branch: {
    type: "string",
    required: true,
    enum: ["gil-puyat", "guadalupe"],
  },
};

/**
 * Schema for POST /api/inquiries
 * Body: { name, email, phone?, subject, message, branch }
 */
export const createInquirySchema = {
  name: { type: "string", required: true },
  email: { type: "string", required: true },
  subject: { type: "string", required: true },
  message: { type: "string", required: true },
  branch: {
    type: "string",
    required: true,
    enum: ["gil-puyat", "guadalupe", "general"],
  },
};

/**
 * Schema for POST /api/announcements
 * Body: { title, content, category, targetBranch?, requiresAcknowledgment?, visibility? }
 */
export const createAnnouncementSchema = {
  title: { type: "string", required: true },
  content: { type: "string", required: true },
  category: {
    type: "string",
    required: true,
    enum: ANNOUNCEMENT_CATEGORIES,
  },
  targetBranch: {
    type: "string",
    enum: ANNOUNCEMENT_TARGET_BRANCHES,
  },
  requiresAcknowledgment: {
    type: "boolean",
  },
  contentType: {
    type: "string",
    enum: ["announcement", "policy"],
  },
  publicationStatus: {
    type: "string",
    enum: ["draft", "scheduled", "published"],
  },
  startsAt: { type: "string" },
  endsAt: { type: "string" },
  effectiveDate: { type: "string" },
  policyKey: { type: "string" },
};

/**
 * Validation schema for updating announcements.
 */
export const updateAnnouncementSchema = {
  title: { type: "string" },
  content: { type: "string" },
  category: {
    type: "string",
    enum: ANNOUNCEMENT_CATEGORIES,
  },
  targetBranch: {
    type: "string",
    enum: ANNOUNCEMENT_TARGET_BRANCHES,
  },
  requiresAcknowledgment: {
    type: "boolean",
  },
  contentType: {
    type: "string",
    enum: ["announcement", "policy"],
  },
  publicationStatus: {
    type: "string",
    enum: ["draft", "scheduled", "published"],
  },
  startsAt: { type: "string" },
  endsAt: { type: "string" },
  effectiveDate: { type: "string" },
  policyKey: { type: "string" },
};

/**
 * Schema for POST /api/maintenance/requests
 * Body: { category, title, description, urgency? }
 */
export const createMaintenanceSchema = {
  category: { type: "string", required: true },
  title: { type: "string", required: true },
  description: { type: "string", required: true },
};
