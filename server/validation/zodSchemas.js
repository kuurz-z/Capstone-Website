import { z } from "zod";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_TARGET_BRANCHES,
  ANNOUNCEMENT_VISIBILITY,
} from "../config/announcements.js";
import { VIOLATION_TYPES } from "../models/TenantViolation.js";

export const setRoleSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["applicant", "tenant", "branch_admin", "owner"]),
});

export const updateBranchSchema = z.object({
  branch: z.enum(["gil-puyat", "guadalupe"]),
});

export const createInquirySchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
  phone: z.string().optional(),
  subject: z.string().trim().min(3, "Subject is required"),
  message: z.string().trim().min(5, "Message must be at least 5 characters"),
  branch: z.enum(["gil-puyat", "guadalupe", "general"]),
  source: z.string().optional(),
  sourceNote: z.string().optional(),
});

export const createMaintenanceSchema = z.object({
  category: z.string().min(1, "Category is required"),
  title: z.string().trim().min(3, "Title must be at least 3 characters"),
  description: z.string().trim().min(5, "Description must be at least 5 characters"),
});

export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Announcement title must be between 3 and 120 characters.")
    .max(120, "Announcement title must be between 3 and 120 characters."),
  content: z
    .string()
    .trim()
    .min(5, "Announcement content must be between 5 and 2000 characters.")
    .max(2000, "Announcement content must be between 5 and 2000 characters."),
  category: z.enum([...ANNOUNCEMENT_CATEGORIES]),
  contentType: z.enum(["announcement", "policy"]).optional().default("announcement"),
  targetBranch: z.enum([...ANNOUNCEMENT_TARGET_BRANCHES]).optional().default("both"),
  visibility: z.enum([...ANNOUNCEMENT_VISIBILITY]).optional().default("tenants-only"),
  requiresAcknowledgment: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
  publicationStatus: z.enum(["draft", "scheduled", "published", "superseded"]).optional(),
  startsAt: z.union([z.string(), z.date()]).optional().nullable(),
  endsAt: z.union([z.string(), z.date()]).optional().nullable(),
  effectiveDate: z.union([z.string(), z.date()]).optional().nullable(),
  policyKey: z.string().optional().nullable(),
  version: z.union([z.number(), z.string()]).optional(),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const updateUserSchema = z.object({
  username: z.string().trim().min(3).max(30).optional(),
  firstName: z.string().trim().min(1, "First name is required").max(50).optional(),
  middleName: z.string().trim().max(50).optional().nullable(),
  lastName: z.string().trim().min(1, "Last name is required").max(50).optional(),
  email: z.string().trim().email("Invalid email format").optional(),
  phone: z.string().optional().nullable(),
  gender: z.enum(["male", "female", "other", "prefer-not-to-say", ""]).optional(),
  civilStatus: z.enum(["single", "married", "widowed", "divorced", "separated", ""]).optional().nullable(),
  nationality: z.string().trim().max(50).optional().nullable(),
  occupation: z.string().trim().max(100).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  emergencyContact: z.string().max(100).optional().nullable(),
  emergencyRelationship: z.string().trim().max(50).optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  studentId: z.string().max(50).optional().nullable(),
  school: z.string().max(100).optional().nullable(),
  yearLevel: z.string().max(50).optional().nullable(),
  role: z.enum(["applicant", "tenant", "branch_admin", "owner"]).optional(),
  branch: z.enum(["gil-puyat", "guadalupe", ""]).optional().nullable(),
});

export const bedSchema = z.object({
  id: z.string().optional(),
  position: z.enum(["upper", "lower", "single"]).optional(),
  bunkBlock: z.string().optional(),
  code: z.string().optional().nullable(),
  status: z.enum(["available", "maintenance"]).optional(),
});

export const createRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Room name is required")
      .max(50, "Room name cannot exceed 50 characters")
      .regex(/^[a-zA-Z0-9\s-]+$/, "Room name must contain letters, numbers, hyphens, and spaces only"),
    roomNumber: z
      .string()
      .trim()
      .min(1, "Room number is required")
      .max(20, "Room number cannot exceed 20 characters")
      .regex(/^[a-zA-Z0-9-]+$/, "Room number must contain letters, numbers, and hyphens only"),
    branch: z.enum(["gil-puyat", "guadalupe"]),
    type: z.enum(["private", "double-sharing", "quadruple-sharing"]),
    capacity: z.number().int().min(1).max(20),
    price: z.number().min(0, "Price must be a positive number").optional(),
    baseRate: z.number().min(0, "Base rate must be a positive number").optional(),
    floor: z.union([z.number(), z.string()]).optional().default(1),
    description: z.string().max(500).optional().default(""),
    monthlyPrice: z.number().optional().nullable(),
    regularLongRate: z.number().optional().nullable(),
    regularShortRate: z.number().optional().nullable(),
    amenities: z.array(z.string().trim()).optional().default([]),
    policies: z.array(z.string().trim()).optional().default([]),
    intendedTenant: z.string().optional().default(""),
    images: z.array(z.string().trim()).optional().default([]),
    isPopular: z.boolean().optional().default(false),
    beds: z.array(bedSchema).optional(),
  })
  .refine((data) => data.price !== undefined || data.baseRate !== undefined, {
    message: "Room price is required",
    path: ["price"],
  })
  .transform((data) => ({
    ...data,
    price: data.price !== undefined ? data.price : data.baseRate,
  }));

export const updateRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Room name is required")
      .max(50, "Room name cannot exceed 50 characters")
      .regex(/^[a-zA-Z0-9\s-]+$/, "Room name must contain letters, numbers, hyphens, and spaces only")
      .optional(),
    roomNumber: z
      .string()
      .trim()
      .min(1, "Room number is required")
      .max(20, "Room number cannot exceed 20 characters")
      .regex(/^[a-zA-Z0-9-]+$/, "Room number must contain letters, numbers, and hyphens only")
      .optional(),
    branch: z.enum(["gil-puyat", "guadalupe"]).optional(),
    type: z.enum(["private", "double-sharing", "quadruple-sharing"]).optional(),
    capacity: z.number().int().min(1).max(20).optional(),
    price: z.number().min(0, "Price must be a positive number").optional(),
    baseRate: z.number().min(0, "Base rate must be a positive number").optional(),
    floor: z.union([z.number(), z.string()]).optional(),
    description: z.string().max(500).optional(),
    monthlyPrice: z.number().optional().nullable(),
    regularLongRate: z.number().optional().nullable(),
    regularShortRate: z.number().optional().nullable(),
    amenities: z.array(z.string().trim()).optional(),
    policies: z.array(z.string().trim()).optional(),
    intendedTenant: z.string().optional(),
    images: z.array(z.string().trim()).optional(),
    isPopular: z.boolean().optional(),
  })
  .transform((data) => {
    if (data.price === undefined && data.baseRate !== undefined) {
      return {
        ...data,
        price: data.baseRate,
      };
    }
    return data;
  });

export const createViolationSchema = z
  .object({
    tenantId: z.string().min(1, "Tenant is required"),
    reservationId: z.string().optional().nullable(),
    branch: z.enum(["gil-puyat", "guadalupe"]).optional().nullable(),
    roomId: z.string().optional().nullable(),
    roomName: z.string().optional().nullable(),
    violationType: z.string().min(1, "Violation category/type is required"),
    customViolationDescription: z.string().optional().nullable(),
    dateOfIncident: z.union([z.string(), z.date()]).optional(),
    timeOfIncident: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    locationOfIncident: z.string().optional().nullable(),
    description: z.string().trim().optional(),
    evidenceNotes: z.string().trim().optional(),
    severity: z.enum(["minor", "moderate", "severe", "critical"]).optional().default("minor"),
    penaltyAmount: z.union([z.number(), z.string()]).optional().default(0),
    penaltyApplied: z.union([z.number(), z.string()]).optional().default(0),
    penaltyReason: z.string().optional().nullable(),
    chargeToBill: z.boolean().optional(),
    evidenceUrl: z.string().optional().nullable(),
    evidenceUrls: z.array(z.string()).optional().default([]),
  })
  .passthrough()
  .refine(
    (data) => {
      const text = (data.evidenceNotes || data.description || "").trim();
      return text.length >= 5;
    },
    {
      message: "Incident notes / description must be at least 5 characters",
      path: ["evidenceNotes"],
    },
  )
  .transform((data) => {
    const desc = (data.evidenceNotes || data.description || "").trim();
    const loc = data.locationOfIncident || data.location || "";
    const penalty =
      Number(data.penaltyApplied !== undefined ? data.penaltyApplied : data.penaltyAmount) || 0;
    return {
      ...data,
      description: desc,
      evidenceNotes: desc,
      location: loc,
      locationOfIncident: loc,
      penaltyAmount: penalty,
      penaltyApplied: penalty,
    };
  });

export const updateViolationSchema = z
  .object({
    violationType: z.enum(VIOLATION_TYPES).optional(),
    customViolationDescription: z.string().trim().max(500).optional().nullable(),
    dateOfIncident: z.string().trim().optional(),
    timeOfIncident: z.string().trim().optional().nullable(),
    locationOfIncident: z.string().trim().max(200).optional().nullable(),
    evidenceNotes: z.string().trim().max(3000).optional().nullable(),
    evidenceUrls: z.array(z.string().trim()).optional(),
    penaltyApplied: z.coerce.number().min(0).optional().nullable(),
    penaltyReason: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const penalty = Number(data.penaltyApplied || 0);
    if (penalty > 0 && (!data.penaltyReason || data.penaltyReason.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A clear penalty reason is required whenever a penalty fee is applied.",
        path: ["penaltyReason"],
      });
    }
    if (
      data.violationType === "custom" &&
      (!data.customViolationDescription || data.customViolationDescription.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom violation description is required when violation type is set to custom.",
        path: ["customViolationDescription"],
      });
    }
    if (data.dateOfIncident) {
      const d = new Date(data.dateOfIncident);
      if (isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid incident date format.",
          path: ["dateOfIncident"],
        });
      } else {
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        if (d > todayEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Incident date cannot be in the future.",
            path: ["dateOfIncident"],
          });
        }
      }
    }
  });

export const overdueNoticeActionSchema = z.object({
  noticeNumber: z.union([z.number(), z.string()]).optional(),
  noticeType: z.string().optional(),
  noticeStage: z.string().optional(),
  targetDate: z.string().optional().nullable(),
  noticeMessage: z.string().trim().max(3000, "Notice message cannot exceed 3000 characters.").optional().nullable(),
  message: z.string().trim().max(3000, "Notice message cannot exceed 3000 characters.").optional().nullable(),
  notes: z.string().trim().max(3000, "Notes cannot exceed 3000 characters.").optional().nullable(),
  forceOverride: z.boolean().optional(),
  sendEmail: z.boolean().optional().default(true),
  sendInApp: z.boolean().optional().default(true),
  customPenalty: z.coerce.number().min(0, "Penalty cannot be negative").max(50000, "Penalty cannot exceed ₱50,000").optional().nullable(),
});

export const adjudicateViolationSchema = z.object({
  decision: z.enum(["confirmed", "dismissed"]),
  decisionReason: z.string().trim().min(1, "A formal administrative decision reason is required.").max(3000),
  status: z.enum(["confirmed", "warning_issued", "penalty_issued", "dismissed", "resolved", "escalated"]).optional(),
  targetStatus: z.enum(["confirmed", "warning_issued", "penalty_issued", "dismissed", "resolved", "escalated"]).optional(),
  penaltyApplied: z.coerce.number().min(0).max(50000).optional().nullable(),
  penaltyReason: z.string().trim().max(1000).optional().nullable(),
  resolution: z.string().trim().max(3000).optional().nullable(),
  chargeToBill: z.boolean().optional().default(false),
});


