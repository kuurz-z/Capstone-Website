/**
 * ============================================================================
 * ZOD VALIDATION SCHEMAS
 * ============================================================================
 *
 * Centralized request validation schemas using Zod.
 * Each schema defines the expected shape of req.body for creation/update
 * endpoints. Used with the validate() middleware in route files.
 *
 * ============================================================================
 */

import { z } from "zod";
import { clean } from "../utils/sanitize.js";

// ─── Shared Primitives ──────────────────────────────────────────────────

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

const branch = z.enum(["gil-puyat", "guadalupe"], {
  errorMap: () => ({ message: "Branch must be 'gil-puyat' or 'guadalupe'" }),
});

const email = z.string().email("Invalid email format").toLowerCase().trim();

// ─── Auth: Registration ─────────────────────────────────────────────────

export const registerSchema = z.object({
  username: z
    .string({ required_error: "Username is required" })
    .min(2, "Username must be at least 2 characters")
    .max(30, "Username must be at most 30 characters")
    .trim(),
  firstName: z
    .string({ required_error: "First name is required" })
    .min(1, "First name is required")
    .max(50)
    .trim(),
  lastName: z
    .string({ required_error: "Last name is required" })
    .min(1, "Last name is required")
    .max(50)
    .trim(),
  phone: z.string().optional(),
  branch: branch.optional(),
  email: email, // Required — Firebase always provides email via token; User model enforces it too
});

// ─── Auth: Set Role ──────────────────────────────────────────────────────

export const setRoleSchema = z.object({
  userId: objectId,
  role: z.enum(["applicant", "tenant", "admin", "superAdmin"], {
    errorMap: () => ({
      message: "Role must be applicant, tenant, admin, or superAdmin",
    }),
  }),
});

// ─── Auth: Update Branch ─────────────────────────────────────────────────

export const updateBranchSchema = z.object({
  branch: branch,
});

// ─── Users: Create User ──────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: email,
  username: z.string().min(2).max(30).trim(),
  firstName: z.string().min(1, "First name is required").max(50).trim(),
  lastName: z.string().min(1, "Last name is required").max(50).trim(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  role: z.enum(["applicant", "admin"]).optional().default("applicant"),
});

// ─── Inquiries: Create Inquiry ───────────────────────────────────────────

export const createInquirySchema = z.object({
  name: z.string().min(1, "Name is required").max(100).trim(),
  email: email,
  phone: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200).trim().transform(clean),
  message: z.string().min(1, "Message is required").max(2000).trim().transform(clean),
  branch: z.enum(["gil-puyat", "guadalupe", "general"], {
    errorMap: () => ({
      message: "Branch must be 'gil-puyat', 'guadalupe', or 'general'",
    }),
  }),
});

// ─── Rooms: Create Room ──────────────────────────────────────────────────

export const createRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").trim(),
  branch: branch,
  type: z.enum(["private", "double-sharing", "quadruple-sharing"], {
    errorMap: () => ({
      message: "Type must be private, double-sharing, or quadruple-sharing",
    }),
  }),
  capacity: z.number().int().positive("Capacity must be a positive integer"),
  price: z.number().positive("Price must be positive"),
  monthlyPrice: z.number().positive().optional(),
  description: z.string().max(500).optional(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
});

// ─── Announcements: Create Announcement ──────────────────────────────────

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim().transform(clean),
  content: z.string().min(1, "Content is required").max(5000).trim().transform(clean),
  category: z.string().min(1, "Category is required").trim(),
  targetBranch: z.enum(["gil-puyat", "guadalupe", "both"]).optional().default("both"),
  requiresAcknowledgment: z.boolean().optional().default(false),
  visibility: z.enum(["public", "tenants-only", "staff-only"]).optional().default("public"),
});

// ─── Maintenance: Create Request ─────────────────────────────────────────

export const createMaintenanceSchema = z.object({
  category: z.string().min(1, "Category is required").trim(),
  title: z.string().min(1, "Title is required").max(200).trim().transform(clean),
  description: z.string().min(1, "Description is required").max(2000).trim().transform(clean),
  urgency: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

// ─── Billing: Generate Room Bill ─────────────────────────────────────────

export const generateRoomBillSchema = z.object({
  roomId: objectId,
  billingMonth: z.string().optional(),
  dueDate: z.string().optional(),
  charges: z
    .object({
      electricity: z.number().min(0).optional().default(0),
      water: z.number().min(0).optional().default(0),
    })
    .optional()
    .default({}),
});

// ─── Billing: Submit Payment Proof ───────────────────────────────────────

export const submitPaymentProofSchema = z.object({
  imageUrl: z.string().min(1, "Proof image is required"),
  amount: z.number().positive("Valid payment amount is required"),
});

// ─── Billing: Verify Payment ─────────────────────────────────────────────

export const verifyPaymentSchema = z.object({
  action: z.enum(["approve", "reject"], {
    errorMap: () => ({ message: "Action must be 'approve' or 'reject'" }),
  }),
  rejectionReason: z.string().optional(),
});
