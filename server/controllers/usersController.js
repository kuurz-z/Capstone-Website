/**
 * User Controllers
 * Extracted from routes for cleaner separation.
 */

import crypto from "crypto";
import mongoose from "mongoose";
import dayjs from "dayjs";
import { User, Reservation, Room, Bill, UtilityReading, MaintenanceRequest, Contract, Stay } from "../models/index.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { getAuth } from "../config/firebase.js";
import logger from "../middleware/logger.js";
import auditLogger from "../utils/auditLogger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";
import {
  DEFAULT_PERMISSIONS,
  ALL_PERMISSIONS,
} from "../middleware/permissions.js";
import {
  ACTIVE_STAY_STATUS_QUERY,
  ACTIVE_OCCUPANCY_STATUS_QUERY,
  PAST_STAY_STATUS_QUERY,
  hasReservationStatus,
  readMoveInDate,
  readMoveOutDate,
  reservationStatusesForQuery,
} from "../utils/lifecycleNaming.js";
import { DELETED_ACCOUNT_LABEL } from "../utils/userReference.js";
import { normalizeAddress } from "../utils/addressUtils.js";
import { releaseOrphanedBeds } from "../services/occupancy/occupancyManager.js";
import { archiveContractForCancelledReservation, archiveContractsForReservationHardDelete } from "../services/contractArchiveService.js";
import { EARLY_STAGE_STATUSES } from "../services/tenantContractSelectionService.js";
import { invalidateUserSessions } from "../services/sessionInvalidationService.js";
import { sendWelcomeAccountActivationEmail } from "../config/email.js";
import { buildCustomPasswordResetLink } from "../services/passwordResetService.js";
import { getPublicUrlConfig } from "../config/publicUrls.js";

const VALID_BRANCHES = ROOM_BRANCHES;
const VALID_TENANT_STATUSES = [
  "applicant",
  "active",
  "inactive",
  "evicted",
  "blacklisted",
];
const TENANT_STATUS_TRANSITIONS = {
  applicant: ["active", "blacklisted"],
  active: ["inactive", "evicted", "blacklisted"],
  inactive: ["active", "blacklisted"],
  evicted: ["blacklisted"],
  blacklisted: [],
};
const LIST_SEARCH_FIELDS = ["username", "firstName", "lastName", "email"];
const LIST_USER_FIELDS = [
  "user_id",
  "username",
  "firstName",
  "lastName",
  "email",
  "phone",
  "role",
  "branch",
  "permissions",
  "accountStatus",
  "isActive",
  "isArchived",
  "gender",
  "dateOfBirth",
  "address",
  "city",
  "emergencyContact",
  "emergencyPhone",
  "studentId",
  "school",
  "yearLevel",
  "createdAt",
];

const escapeRegex = (value = "") =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const VALID_ROLES = ["applicant", "tenant", "branch_admin", "owner"];
const LIFECYCLE_MANAGED_ROLES = ["applicant", "tenant"];
const ROLE_LABELS = {
  applicant: "Applicant",
  tenant: "Tenant",
  branch_admin: "Branch Admin",
  owner: "Dorm Owner",
};

const buildFirebaseClaimsForRole = (role) => {
  if (role === "owner") {
    return { owner: true, branch_admin: true };
  }
  if (role === "branch_admin") {
    return { branch_admin: true };
  }
  return {};
};

const ACCESS_STATE_FIELDS = [
  "role",
  "permissions",
  "branch",
  "tenantStatus",
  "accountStatus",
  "isActive",
  "isArchived",
];

const copyAccessState = (source = {}) =>
  Object.fromEntries(
    ACCESS_STATE_FIELDS.map((field) => [
      field,
      Array.isArray(source[field])
        ? [...source[field]]
        : source[field] && typeof source[field] === "object"
          ? structuredClone(source[field])
          : source[field],
    ]),
  );

const accessStateMatches = (actual, expected, fields) =>
  fields.every(
    (field) => JSON.stringify(actual?.[field]) === JSON.stringify(expected[field]),
  );

const buildAccessStateRestoreUpdate = (original, fields) => {
  const $set = {};
  const $unset = {};
  for (const field of fields) {
    if (original[field] === undefined) $unset[field] = 1;
    else $set[field] = original[field];
  }
  return { $set, $unset };
};

const canTransitionTenantStatus = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return true;
  return (TENANT_STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus);
};

const syncFirebaseUserDisabledState = async (firebaseUid, disabled) => {
  if (!firebaseUid) return;
  const auth = getAuth();
  if (!auth) return;
  try {
    await auth.updateUser(firebaseUid, { disabled });
    if (disabled && typeof auth.revokeRefreshTokens === "function") {
      await auth.revokeRefreshTokens(firebaseUid);
    }
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      logger.warn(
        { error, firebaseUid, disabled },
        "[syncFirebaseUserDisabledState] Firebase sync error (non-fatal)",
      );
    }
  }
};

const isLifecycleManagedRole = (role) => LIFECYCLE_MANAGED_ROLES.includes(role);

const hasBranchAccessToTargetUser = async (targetUser, branchFilter) => {
  if (!branchFilter) return true;
  if (!targetUser) return false;
  if (targetUser.branch === branchFilter) return true;

  const branchRoomIds = await Room.find({ branch: branchFilter })
    .distinct("_id");

  if (branchRoomIds.length === 0) return false;

  const linkedReservation = await Reservation.findOne({
    userId: targetUser._id,
    roomId: { $in: branchRoomIds },
  })
    .select("_id")
    .lean();

  return Boolean(linkedReservation);
};

const getDeleteSafeguardsForUser = async (userId) => {
  const [
    reservations,
    activeReservations,
    issuedBills,
    draftBills,
    utilityReadings,
    maintenanceRequests,
    occupiedBeds,
  ] = await Promise.all([
    Reservation.countDocuments({
      userId,
      isArchived: { $ne: true },
    }),
    Reservation.countDocuments({
      userId,
      isArchived: { $ne: true },
      status: { $in: ACTIVE_STAY_STATUS_QUERY },
    }),
    Bill.countDocuments({
      userId,
      isArchived: false,
      status: { $ne: "draft" },
    }),
    Bill.countDocuments({
      userId,
      isArchived: false,
      status: "draft",
    }),
    UtilityReading.countDocuments({
      tenantId: userId,
      isArchived: false,
    }),
    MaintenanceRequest.countDocuments({
      $or: [{ userId }, { user_id: userId }],
      isArchived: { $ne: true },
    }),
    Room.countDocuments({
      "beds.occupiedBy.userId": userId,
      isArchived: { $ne: true },
    }),
  ]);

  return {
    reservations,
    activeReservations,
    issuedBills,
    draftBills,
    utilityReadings,
    maintenanceRequests,
    occupiedBeds,
  };
};

const hasSignificantUserHistory = (safeguards) =>
  Object.values(safeguards || {}).some((value) => Number(value || 0) > 0);

/**
 * POST /api/users
 *
 * Admin-created user account.
 * Creates a Firebase Auth user + MongoDB record.
 * Sends a password-reset email so the user can set their own password.
 *
 * Access: Admin (applicant only) | Owner (applicant or branch_admin)
 */
export const createUser = async (req, res, next) => {
  let firebaseUid = null; // track for rollback

  try {
    const { email, username, firstName, lastName, phone, role, password, branch } =
      req.body;

    // --- Validate required fields ---
    if (!email || !username || !firstName || !lastName) {
      return res.status(400).json({
        error:
          "Missing required fields: email, username, firstName, and lastName are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // --- Validate or generate password ---
    let effectivePassword = password;
    if (!effectivePassword) {
      effectivePassword = crypto.randomBytes(12).toString("hex");
    } else if (effectivePassword.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters",
        code: "WEAK_PASSWORD",
      });
    }

    // --- Validate role ---
    const allowedRole = role || "applicant";
    if (allowedRole === "owner") {
      return res.status(403).json({
        error: "Cannot create Owner accounts",
        code: "ROLE_FORBIDDEN",
      });
    }
    if (allowedRole === "branch_admin" && !req.isOwner) {
      return res.status(403).json({
        error: "Only owners can create branch admin accounts",
        code: "ROLE_FORBIDDEN",
      });
    }
    if (!["applicant", "branch_admin"].includes(allowedRole)) {
      return res.status(400).json({
        error: "Role must be 'applicant' or 'branch_admin'",
        code: "INVALID_ROLE",
      });
    }

    let assignedBranch = branch ? String(branch).trim() : "";
    if (!assignedBranch && !req.isOwner && req.authUser?.branch) {
      assignedBranch = String(req.authUser.branch).trim();
    }
    if (assignedBranch && !VALID_BRANCHES.includes(assignedBranch)) {
      return res.status(400).json({
        error: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(", ")}`,
        code: "INVALID_BRANCH",
      });
    }
    if (allowedRole === "branch_admin" && !assignedBranch) {
      return res.status(400).json({
        error: "Branch is required when creating a branch admin account",
        code: "BRANCH_REQUIRED",
      });
    }

    // --- Check for duplicates in MongoDB ---
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(409).json({
        error: "Email already in use",
        code: "EMAIL_TAKEN",
      });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({
        error: "Username already taken",
        code: "USERNAME_TAKEN",
      });
    }

    // --- Create Firebase Auth account ---
    const auth = getAuth();
    if (!auth) {
      return res.status(503).json({
        error: "Firebase Admin SDK is not available",
        code: "FIREBASE_UNAVAILABLE",
      });
    }

    const firebaseUser = await auth.createUser({
      email: email.toLowerCase(),
      password: effectivePassword,
      displayName: `${firstName} ${lastName}`.trim(),
      emailVerified: false,
    });
    firebaseUid = firebaseUser.uid;

    // If creating an admin, set Firebase custom claims
    if (allowedRole === "branch_admin") {
      await auth.setCustomUserClaims(firebaseUid, { branch_admin: true });
    }

    // --- Create MongoDB user record ---
    const user = new User({
      firebaseUid,
      email: email.toLowerCase(),
      username,
      firstName,
      lastName,
      phone: phone || null,
      branch: assignedBranch || null,
      role: allowedRole,
      isEmailVerified: false,
      isActive: true,
      tenantStatus: "applicant",
      permissions: DEFAULT_PERMISSIONS[allowedRole] || [],
    });

    await user.save();

    // Deliver a welcome & account activation link so the new user can set their password
    // and access their account without the admin communicating credentials out-of-band.
    // Uses the identical Firebase link-generation + custom URL rewrite path
    // as the Forgot Password controller — no new email infrastructure needed.
    // Non-fatal: account is fully created regardless of email delivery outcome.
    try {
      const rawFirebaseLink = await auth.generatePasswordResetLink(
        email.toLowerCase(),
        { url: `${getPublicUrlConfig().publicFrontendUrl}/signin`, handleCodeInApp: false },
      );
      const setupLink = buildCustomPasswordResetLink(rawFirebaseLink, process.env, { type: "welcome" });
      const roleLabel = ROLE_LABELS[allowedRole] || "Applicant";
      await sendWelcomeAccountActivationEmail({
        to: email.toLowerCase(),
        name: `${firstName} ${lastName}`.trim(),
        roleLabel,
        username,
        setupLink,
      });
      logger.info(`[createUser] Welcome & account activation email delivered to ${email}`);
    } catch (emailError) {
      // Non-fatal: the Firebase + MongoDB account is fully created and functional.
      // If delivery fails the user can recover via Forgot Password on sign-in.
      logger.warn(`[createUser] Welcome email delivery failed (non-fatal): ${emailError.message}`);
    }

    // --- Audit log ---
    await auditLogger.logModification(
      req,
      "user",
      user._id.toString(),
      null,
      user.toObject(),
      `Admin created account for ${email} with role ${allowedRole}`,
    );

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        user_id: user.user_id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        branch: user.branch,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to create user");
    next(error);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const matchQuery = {};
    const targetBranch = req.branchFilter || (req.query?.branch && req.query.branch !== "all" ? req.query.branch : null);
    if (targetBranch) {
      const branchRooms = await Room.find({ branch: targetBranch }).select("_id").lean();
      const branchRoomIds = branchRooms.map((r) => r._id);
      const branchUserIds = await Reservation.find({ roomId: { $in: branchRoomIds } }).distinct("userId");

      if (req.query?.includeUnbranched !== "false") {
        const otherBranchRooms = await Room.find({ branch: { $ne: targetBranch } }).select("_id").lean();
        const otherBranchRoomIds = otherBranchRooms.map((r) => r._id);
        const otherBranchUserIds = await Reservation.find({
          roomId: { $in: otherBranchRoomIds },
          status: { $in: ACTIVE_STAY_STATUS_QUERY },
          isArchived: { $ne: true },
        }).distinct("userId");

        matchQuery.$or = [
          { branch: targetBranch },
          { _id: { $in: branchUserIds } },
          {
            branch: { $in: [null, ""] },
            role: "applicant",
            _id: { $nin: otherBranchUserIds },
          },
        ];
      } else {
        matchQuery.$or = [
          { branch: targetBranch },
          { _id: { $in: branchUserIds } },
        ];
      }
    }

    const [statsResult = {}] = await User.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { 
                  $sum: { $cond: [{ $ne: ["$isArchived", true] }, 1, 0] } 
                },
                activeCount: {
                  $sum: {
                    $cond: [
                      { $and: [{ $eq: ["$accountStatus", "active"] }, { $ne: ["$isArchived", true] }] },
                      1, 0
                    ],
                  },
                },
                verifiedCount: {
                  $sum: {
                    $cond: [
                      { $and: [{ $eq: ["$isEmailVerified", true] }, { $ne: ["$isArchived", true] }] },
                      1, 0
                    ],
                  },
                },
                archivedCount: {
                  $sum: { $cond: [{ $eq: ["$isArchived", true] }, 1, 0] }
                }
              },
            },
          ],
          byRole: [
            { $match: { isArchived: { $ne: true } } },
            { $group: { _id: "$role", count: { $sum: 1 } } }
          ],
          byAccountStatus: [
            { $match: { isArchived: { $ne: true } } },
            { $group: { _id: "$accountStatus", count: { $sum: 1 } } }
          ],
          byBranch: req.isOwner
            ? [
                { $match: { isArchived: { $ne: true } } },
                { $group: { _id: "$branch", count: { $sum: 1 } } }
              ]
            : [],
        },
      },
    ]);

    const totals = statsResult.totals?.[0] || {
      total: 0,
      activeCount: 0,
      verifiedCount: 0,
      archivedCount: 0,
    };

    // Format response
    const stats = {
      total: totals.total,
      activeCount: totals.activeCount,
      verifiedCount: totals.verifiedCount,
      archivedCount: totals.archivedCount || 0,
      byRole: { applicant: 0, tenant: 0, branch_admin: 0, owner: 0 },
      byAccountStatus: {
        active: 0,
        suspended: 0,
        banned: 0,
        pending_verification: 0,
      },
      byBranch: {},
    };

    (statsResult.byRole || []).forEach((item) => {
      if (item._id) stats.byRole[item._id] = item.count;
    });
    (statsResult.byAccountStatus || []).forEach((item) => {
      if (item._id) stats.byAccountStatus[item._id] = item.count;
    });
    (statsResult.byBranch || []).forEach((item) => {
      if (item._id) stats.byBranch[item._id] = item.count;
    });

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

export const getUsersByBranch = async (req, res, next) => {
  try {
    const { branch } = req.params;

    const validBranches = ["gil-puyat", "guadalupe", ""];
    if (!validBranches.includes(branch)) {
      return res.status(400).json({
        error: "Invalid branch. Must be 'gil-puyat', 'guadalupe', or empty",
        code: "INVALID_BRANCH",
      });
    }

    const users = await User.find({ branch })
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const getEmailByUsername = async (req, res, next) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        error: "Username is required",
        code: "MISSING_USERNAME",
      });
    }

    const trimmedUsername = username.trim();

    const user = await User.findOne({
      username: {
        $regex: new RegExp(
          `^${trimmedUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      },
    }).select("email username");

    if (!user) {
      return res.status(404).json({
        error: "Username not found",
        code: "USERNAME_NOT_FOUND",
      });
    }

    res.json({ email: user.email });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const {
      role,
      branch,
      isActive,
      tenantStatus,
      accountStatus,
      search,
      page = 1,
      limit = 20,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    // Build query with branch filter (exclude archived/soft-deleted users)
    const query = { isArchived: false };

    const targetBranch = req.branchFilter || (branch && branch !== "all" ? branch : null);
    if (targetBranch) {
      const branchRooms = await Room.find({ branch: targetBranch }).select("_id").lean();
      const branchRoomIds = branchRooms.map((r) => r._id);
      const branchUserIds = await Reservation.find({ roomId: { $in: branchRoomIds } }).distinct("userId");

      if (req.query?.includeUnbranched !== "false") {
        const otherBranchRooms = await Room.find({ branch: { $ne: targetBranch } }).select("_id").lean();
        const otherBranchRoomIds = otherBranchRooms.map((r) => r._id);
        const otherBranchUserIds = await Reservation.find({
          roomId: { $in: otherBranchRoomIds },
          status: { $in: ACTIVE_STAY_STATUS_QUERY },
          isArchived: { $ne: true },
        }).distinct("userId");

        query.$or = [
          { branch: targetBranch },
          { _id: { $in: branchUserIds } },
          {
            branch: { $in: [null, ""] },
            role: "applicant",
            _id: { $nin: otherBranchUserIds },
          },
        ];
      } else {
        query.$or = [
          { branch: targetBranch },
          { _id: { $in: branchUserIds } },
        ];
      }
    }

    if (role) {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    if (tenantStatus) {
      query.tenantStatus = tenantStatus;
    }

    if (accountStatus) {
      if (accountStatus === "archived") {
        query.isArchived = true;
      } else if (accountStatus.includes(",")) {
        query.accountStatus = { $in: accountStatus.split(",").map((s) => s.trim()) };
      } else {
        query.accountStatus = accountStatus;
      }
    }

    if (search?.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
      const searchOr = LIST_SEARCH_FIELDS.map((field) => ({ [field]: searchRegex }));
      
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    // Pagination
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const allowedSortFields = new Set([
      "createdAt",
      "firstName",
      "lastName",
      "email",
      "username",
      "role",
      "branch",
      "accountStatus",
      "isActive",
      "tenantStatus",
    ]);
    const sortField = allowedSortFields.has(sort) ? sort : "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions = { [sortField]: sortOrder };

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select(LIST_USER_FIELDS.join(" "))
        .lean(),
      User.countDocuments(query),
    ]);

    const userIds = users.map((entry) => entry._id).filter(Boolean);
    const activeStayUserIds = new Set();
    const lifecycleReservationUserIds = new Set();

    if (userIds.length > 0) {
      const [activeStays, lifecycleReservations] = await Promise.all([
        Reservation.find({
          userId: { $in: userIds },
          status: { $in: ACTIVE_STAY_STATUS_QUERY },
          isArchived: { $ne: true },
        })
          .select("userId")
          .lean(),
        Reservation.find({
          userId: { $in: userIds },
          status: {
            $nin: reservationStatusesForQuery("cancelled", "archived", "moveOut"),
          },
          isArchived: { $ne: true },
        })
          .select("userId")
          .lean(),
      ]);

      activeStays.forEach((entry) => activeStayUserIds.add(String(entry.userId)));
      lifecycleReservations.forEach((entry) =>
        lifecycleReservationUserIds.add(String(entry.userId)),
      );
    }

    const hydratedUsers = users.map((entry) => ({
      ...entry,
      hasActiveStay: activeStayUserIds.has(String(entry._id)),
      hasLifecycleReservation: lifecycleReservationUserIds.has(String(entry._id)),
      lifecycleManaged: isLifecycleManagedRole(entry.role),
    }));

    res.json({
      users: hydratedUsers,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        total,
        itemsPerPage: limitNum,
        hasNextPage: pageNum * limitNum < total,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    const user = await User.findById(userId)
      .select("-__v")
      .populate("statusChangedBy", "firstName lastName email role")
      .populate("archivedBy", "firstName lastName email role");

    if (!user) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    if (
      req.branchFilter &&
      !(await hasBranchAccessToTargetUser(user, req.branchFilter))
    ) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    const query = { _id: userId };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    const existingUser = await User.findOne(query);
    if (!existingUser) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    // Store old data for audit log
    const oldUserData = existingUser.toObject();
    const activeStayReservation = await Reservation.findOne({
      userId,
      status: { $in: ACTIVE_STAY_STATUS_QUERY },
      isArchived: { $ne: true },
    })
      .select("_id status")
      .lean();

    const ALLOWED_ADMIN_UPDATE_FIELDS = [
      "username",
      "firstName",
      "middleName",
      "lastName",
      "email",
      "phone",
      "profileImage",
      "role",
      "branch",
      "tenantStatus",
      "isActive",
      // Extended profile fields
      "address",
      "city",
      "gender",
      "civilStatus",
      "nationality",
      "occupation",
      "dateOfBirth",
      "emergencyContact",
      "emergencyRelationship",
      "emergencyPhone",
      "studentId",
      "school",
      "yearLevel",
    ];

    // Build update object from whitelist only
    const updateData = {};
    for (const field of ALLOWED_ADMIN_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updateData[field] = field === "address" && typeof req.body[field] === "string"
          ? normalizeAddress(req.body[field]).value
          : req.body[field];
      }
    }

    // Prevent changing sensitive fields
    delete updateData._id;
    delete updateData.firebaseUid;
    delete updateData.createdAt;

    // Only owners can change roles
    if (updateData.role && !req.isOwner) {
      delete updateData.role;
    }

    // Only owners can change branch assignment
    if (updateData.branch !== undefined && !req.isOwner) {
      delete updateData.branch;
    }

    if (updateData.role !== undefined) {
      const nextRole = String(updateData.role).trim();
      if (!VALID_ROLES.includes(nextRole)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
          code: "INVALID_ROLE",
        });
      }
      updateData.role = nextRole;

      const currentRole = existingUser.role;
      const isManualLifecycleRoleEdit =
        currentRole !== nextRole &&
        isLifecycleManagedRole(currentRole) &&
        isLifecycleManagedRole(nextRole);

      if (isManualLifecycleRoleEdit) {
        if (activeStayReservation) {
          return res.status(409).json({
            error:
              "This tenant currently has an active stay. Please process their move-out before changing their role.",
            code: "ACTIVE_STAY_ROLE_CHANGE_BLOCKED",
          });
        }

        return res.status(409).json({
          error:
            "Tenant and applicant roles are managed automatically through reservation and move-in workflows.",
          code: "ROLE_LIFECYCLE_MANAGED",
        });
      }

      if (["branch_admin", "owner"].includes(nextRole)) {
        updateData.permissions = DEFAULT_PERMISSIONS[nextRole] || [];
      } else {
        updateData.permissions = [];
      }

      if (updateData.tenantStatus === undefined) {
        if (nextRole === "tenant") {
          updateData.tenantStatus = "active";
        } else if (nextRole === "applicant") {
          updateData.tenantStatus = "applicant";
        }
      }
    }

    const currentRole = existingUser.role;
    const nextRole = updateData.role || currentRole;

    // Tenant status is managed exclusively by reservation lifecycles.
    // 1. For admin accounts (branch_admin, owner), tenantStatus is not applicable — strip safely.
    // 2. If tenantStatus was explicitly sent in req.body but is unchanged from the current persisted record, strip it so standard profile updates succeed.
    if (["branch_admin", "owner"].includes(nextRole)) {
      delete updateData.tenantStatus;
    } else if (
      req.body.tenantStatus !== undefined &&
      String(req.body.tenantStatus).trim() === String(existingUser.tenantStatus || "").trim()
    ) {
      delete updateData.tenantStatus;
    }

    if (updateData.tenantStatus !== undefined) {
      const nextStatus = String(updateData.tenantStatus).trim();
      if (!VALID_TENANT_STATUSES.includes(nextStatus)) {
        return res.status(400).json({
          error: `Invalid tenant status. Must be one of: ${VALID_TENANT_STATUSES.join(", ")}`,
          code: "INVALID_TENANT_STATUS",
        });
      }

      if (
        req.body.tenantStatus !== undefined &&
        (isLifecycleManagedRole(currentRole) || isLifecycleManagedRole(nextRole))
      ) {
        return res.status(409).json({
          error: "Tenant status is managed automatically through reservation and check-in workflows.",
          code: "ROLE_LIFECYCLE_MANAGED",
        });
      }

      if (["branch_admin", "owner"].includes(nextRole)) {
        return res.status(400).json({
          error: "Administrator accounts do not use tenant status states.",
          code: "ROLE_TENANT_STATUS_CONFLICT",
        });
      }

      if (!canTransitionTenantStatus(existingUser.tenantStatus, nextStatus)) {
        return res.status(400).json({
          error: "This tenant status change is not permitted from the current account state.",
          code: "INVALID_TENANT_STATUS_TRANSITION",
        });
      }

      updateData.tenantStatus = nextStatus;

      // Keep role in sync for non-admin lifecycle changes.
      if (updateData.role === undefined) {
        if (nextStatus === "active") {
          updateData.role = "tenant";
        } else if (existingUser.role === "tenant") {
          updateData.role = "applicant";
        }
      }
    }

    const originalAccessState = copyAccessState(oldUserData);
    const accessFields = ["role", "branch", "permissions", "isActive", "tenantStatus"];
    const changedAccessFields = accessFields.filter((field) => updateData[field] !== undefined && JSON.stringify(updateData[field]) !== JSON.stringify(oldUserData[field]));
    let invalidation = null;
    if (changedAccessFields.length > 0) {
      const reason = changedAccessFields.includes("role") ? "role_changed"
        : changedAccessFields.includes("branch") ? "branch_reassigned"
          : changedAccessFields.includes("permissions") ? "permissions_changed" : "account_access_scope_changed";
      invalidation = await invalidateUserSessions({ user: existingUser, reason, req });
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (changedAccessFields.length > 0) {
      const auth = getAuth();
      try {
        if (!auth || !existingUser.firebaseUid) {
          throw new Error("Firebase claims synchronization is unavailable");
        }
        // Claims are derived only from the authoritative, persisted user.
        await auth.setCustomUserClaims(
          existingUser.firebaseUid,
          buildFirebaseClaimsForRole(user.role),
        );
      } catch (_firebaseError) {
          let rollbackSucceeded = false;
          let accountRestricted = false;
          try {
            await User.findByIdAndUpdate(
              userId,
              buildAccessStateRestoreUpdate(originalAccessState, changedAccessFields),
              { new: true, runValidators: false },
            );
            const reloaded = await User.findById(userId)
              .select(ACCESS_STATE_FIELDS.join(" "))
              .lean();
            rollbackSucceeded = accessStateMatches(reloaded, originalAccessState, changedAccessFields);
          } catch (_rollbackError) {
            rollbackSucceeded = false;
          }

          if (!rollbackSucceeded) {
            try {
              const restricted = await User.findByIdAndUpdate(
                userId,
                { $set: { isActive: false, accountStatus: "suspended" } },
                { new: true, runValidators: false },
              );
              accountRestricted = restricted?.isActive === false && restricted?.accountStatus === "suspended";
            } catch (_restrictionError) {
              accountRestricted = false;
            }
          }

          await auditLogger.log({
            req,
            type: "security",
            action: rollbackSucceeded
              ? "firebase_claims_sync_failed_rolled_back"
              : "firebase_claims_sync_failed_rollback_failed",
            severity: rollbackSucceeded ? "high" : "critical",
            entityType: "user",
            entityId: userId,
            details: rollbackSucceeded
              ? "Firebase access claims synchronization failed; MongoDB access state was restored."
              : "Firebase access claims synchronization and MongoDB rollback failed; manual reconciliation is required.",
            metadata: {
              attemptedAccessChange: changedAccessFields,
              rollbackSucceeded,
              accountRestricted,
              firebaseErrorCategory: "firebase_claims_sync_error",
              sessionInvalidation: {
                logicalInvalidationSucceeded: true,
                failedStores: (invalidation?.failures || []).map((failure) => failure.store),
              },
              timestamp: new Date().toISOString(),
            },
          });

          if (!rollbackSucceeded) {
            return sendError(
              res,
              "The access update could not be reconciled. The account requires administrative review.",
              503,
              "ACCESS_UPDATE_RECONCILIATION_REQUIRED",
            );
          }
          return sendError(
            res,
            "The access update could not be completed. No access changes were retained.",
            503,
            "FIREBASE_CLAIMS_SYNC_FAILED",
          );
      }
    }
    // Log user modification
    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldUserData,
      user.toObject(),
    );

    res.json({
      message: "User updated successfully",
      user,
      sessionCleanupComplete: !invalidation?.failures?.length,
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update user");
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const isHardDelete = String(req.query?.hardDelete || "").toLowerCase() === "true";
    const isForceDelete = String(req.query?.force || "").toLowerCase() === "true";
    const confirmationText = String(req.body?.confirmationText || "");

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    const canAccessTarget = await hasBranchAccessToTargetUser(
      user,
      req.isOwner ? null : req.branchFilter,
    );

    if (!canAccessTarget) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    if (!req.isOwner && ["branch_admin", "owner"].includes(user.role)) {
      return res.status(403).json({
        error: "Only the owner can archive admin accounts",
        code: "ROLE_FORBIDDEN",
      });
    }

    if (isHardDelete && (!req.isOwner && !req.isAdmin)) {
      return res.status(403).json({
        error: "Only owners or admins can permanently delete accounts",
        code: "ROLE_FORBIDDEN",
      });
    }

    if (isForceDelete && !req.isOwner) {
      return res.status(403).json({
        error: "Only the owner can force delete accounts",
        code: "ROLE_FORBIDDEN",
      });
    }

    if (isForceDelete && confirmationText !== "DELETE") {
      return res.status(400).json({
        error: "Force delete requires confirmation text DELETE",
        code: "FORCE_DELETE_CONFIRMATION_REQUIRED",
      });
    }

    const safeguards = await getDeleteSafeguardsForUser(user._id);
    const hasSignificantHistory = hasSignificantUserHistory(safeguards);
    const actor = await User.findOne({ firebaseUid: req.user.uid })
      .select("_id")
      .lean();

    const stopUnsafeHardDelete = async (cleanupStage, firebaseCategory) => {
      await User.findByIdAndUpdate(userId, {
        $set: { isActive: false, accountStatus: "suspended" },
      });
      await auditLogger.log({
        req,
        type: "security",
        action: "hard_delete_reconciliation_required",
        severity: "critical",
        entityType: "user",
        entityId: userId,
        details: "Hard deletion stopped because authentication cleanup was incomplete",
        metadata: {
          targetUserId: userId,
          actorId: actor?._id ? String(actor._id) : null,
          cleanupStage,
          firebaseCategory,
          mongoDeletion: "skipped",
          reconciliationRequired: true,
          timestamp: new Date().toISOString(),
        },
      });
      return res.status(503).json({
        error: "Authentication cleanup is incomplete. The account was restricted and requires reconciliation.",
        code: "HARD_DELETE_RECONCILIATION_REQUIRED",
        hardDelete: false,
        restricted: true,
        reconciliationRequired: true,
        cleanupStage,
      });
    };

    if (!isHardDelete) {
      const oldData = user.toObject();
      if (hasSignificantHistory) {
        await user.ban(
          actor?._id || null,
          "Blocked via delete endpoint because the account has significant history",
        );
        await invalidateUserSessions({ user, reason: "account_blocked", req });
        await syncFirebaseUserDisabledState(user.firebaseUid, true);

        await auditLogger.logModification(
          req,
          "user",
          userId,
          oldData,
          user.toObject(),
          "User blocked via delete endpoint because significant history exists",
        );

        return res.json({
          message: "User blocked successfully",
          blocked: true,
          blockedBecauseOfHistory: true,
          archived: false,
          hardDelete: false,
          deletedId: userId,
          displayLabel: "Blocked account",
          safeguards,
        });
      }

      const wasArchived = !!user.isArchived;
      if (!wasArchived) {
        await user.archive(actor?._id || null);
        await invalidateUserSessions({ user, reason: "account_archived", req });
        await syncFirebaseUserDisabledState(user.firebaseUid, true);
      }

      await auditLogger.logModification(
        req,
        "user",
        userId,
        oldData,
        user.toObject(),
        "User archived via delete endpoint",
      );

      return res.json({
        message: wasArchived ? "User already archived" : "User archived successfully",
        archived: true,
        blocked: false,
        hardDelete: false,
        deletedId: userId,
        safeguards,
      });
    }

    if (hasSignificantHistory && !isForceDelete) {
      return res.status(409).json({
        error:
          "Hard delete blocked. This account has significant history and must be blocked instead, unless the owner uses force delete.",
        code: "HARD_DELETE_BLOCKED",
        displayLabel: "Blocked account",
        requiresForceDelete: req.isOwner,
        deletedAccountLabel: DELETED_ACCOUNT_LABEL,
        safeguards,
      });
    }

    // ── Safety guard: block force-delete if user has an active occupancy reservation
    // (status: reserved or moveIn). Admin must process move-out first.
    // Exception: isForceDelete bypasses this — the transactional cleanup below will
    // archive the reservations and release the beds atomically before user deletion.
    const activeOccupancyReservations = await Reservation.find({
      userId: user._id,
      isArchived: { $ne: true },
      status: { $in: ACTIVE_OCCUPANCY_STATUS_QUERY },
    }).select("_id roomId").lean();

    const activeOccupancyCount = activeOccupancyReservations.length;

    if (activeOccupancyCount > 0 && !isForceDelete) {
      return res.status(409).json({
        error:
          `Cannot delete this account — the user has ${activeOccupancyCount} active reservation(s) currently holding a room or bed (status: reserved/moveIn). ` +
          "Process a move-out or cancel those reservations before deleting this account.",
        code: "ACTIVE_OCCUPANCY_BLOCK",
        activeOccupancyCount,
        safeguards,
      });
    }

    // ── Safety guard: block deletion if this user has a Contract that has
    // progressed past early-stage (draft/incomplete/ready_for_generation) and
    // is not already archived. Below this point the Reservation itself is
    // only ARCHIVED, never deleted — so unlike reservationCrudController's
    // hard-delete (which cascades because the Reservation vanishes entirely),
    // the actual risk here is narrower: the Contract's tenantId would point
    // at a User that no longer exists while its reservationId still resolves.
    // A "generated"+ Contract can carry a real prepared/signed lease
    // document, so this must never be silently allowed through — require an
    // admin to explicitly archive the Contract first (default), or, under
    // owner force-delete, actively archive eligible Contracts as part of the
    // cascade below rather than merely logging a warning about them.
    const userReservations = await Reservation.find({
      userId: user._id,
      isArchived: { $ne: true },
    }).select("_id").lean();
    const userReservationIds = userReservations.map((r) => r._id);
    const progressedContracts = userReservationIds.length
      ? await Contract.find({
          reservationId: { $in: userReservationIds },
          archivedAt: null,
          status: { $nin: [...EARLY_STAGE_STATUSES] },
        }).select("_id contractNumber status reservationId").lean()
      : [];

    if (progressedContracts.length && !isForceDelete) {
      return res.status(409).json({
        error:
          `Cannot delete this account — ${progressedContracts.length} Contract(s) have progressed beyond draft/incomplete and are not archived. ` +
          "Archive or resolve those Contracts first, or use owner force-delete to have them archived automatically.",
        code: "PROGRESSED_CONTRACT_BLOCK",
        progressedContracts: progressedContracts.map((c) => ({
          contractId: c._id, contractNumber: c.contractNumber, status: c.status,
        })),
        safeguards,
      });
    }

    // ── Transactional cleanup: archive reservations → release beds → delete user ──
    // Done inside a MongoDB session to ensure atomicity. If any step throws,
    // the user document is NOT deleted and beds remain correctly assigned.
    let invalidation;
    try {
      invalidation = await invalidateUserSessions({
        user,
        reason: "account_deleted",
        req,
        failClosed: true,
      });
    } catch (_error) {
      return stopUnsafeHardDelete("logical_revocation", "session_invalidation_failed");
    }

    const unsafeFirebaseFailure = invalidation.failures?.find(
      (failure) =>
        failure.store === "firebase" && failure.error?.code !== "auth/user-not-found",
    );
    if (unsafeFirebaseFailure) {
      return stopUnsafeHardDelete("firebase_token_revocation", "refresh_token_revocation_failed");
    }

    if (user.firebaseUid) {
      const auth = getAuth();
      if (!auth) {
        return stopUnsafeHardDelete("firebase_user_deletion", "firebase_admin_unavailable");
      }
      try {
        await auth.deleteUser(user.firebaseUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") {
          return stopUnsafeHardDelete("firebase_user_deletion", "firebase_user_delete_failed");
        }
      }
    }

    const session = await mongoose.startSession();
    let archivedReservationIds = [];

    try {
      await session.withTransaction(async () => {
        // 1. Archive all remaining non-archived reservations (preserve audit trail)
        if (safeguards.reservations > 0) {
          const reservationsToArchive = await Reservation.find({
            userId: user._id,
            isArchived: { $ne: true },
          }).select("_id").lean().session(session);

          archivedReservationIds = reservationsToArchive.map((r) => r._id);

          if (archivedReservationIds.length > 0) {
            await Reservation.updateMany(
              { userId: user._id, isArchived: { $ne: true } },
              { $set: { isArchived: true, status: "archived" } },
              { session },
            );
          }
        }

        // 2. Hard delete the user document (beds released after transaction)
        await User.findByIdAndDelete(userId).session(session);
      });
    } finally {
      session.endSession();
    }

    // ── Post-transaction: release beds & cascade-cancel stays ──
    // Cascade-cancel any active/in-progress stays belonging to the user or archived reservations
    // to immediately release room beds, clear occupancy, and preserve audit history
    try {
      const stayFilter = {
        $or: [
          { tenantId: user._id },
          ...(archivedReservationIds.length > 0 ? [{ reservationId: { $in: archivedReservationIds } }] : []),
        ],
        status: { $in: ["active", "ending_soon", "expired_occupancy_continuing"] },
      };
      await Stay.updateMany(
        stayFilter,
        {
          $set: {
            status: "terminated",
            endedAt: new Date(),
            endReason: "Tenant account deleted",
          },
        },
      );
    } catch (stayErr) {
      logger.warn({ err: stayErr, userId: user._id }, "Account delete: stay cancellation failed (non-fatal)");
    }

    // This is intentionally outside the transaction — bed release calls emitRoomUpdate
    // which cannot run inside a MongoDB session. The user doc is already deleted at
    // this point so any failure here is repaired by the nightly reconciliation job.
    if (archivedReservationIds.length > 0) {
      await releaseOrphanedBeds([], archivedReservationIds);
    }
    await releaseOrphanedBeds([user._id], []);

    // ── Post-transaction: cascade-archive early-stage Contracts; under
    // force-delete, also archive progressed ones (the pre-check above
    // already blocked non-force deletion when any existed) ──────────────
    // The archived Reservations above are preserved (not deleted), so a
    // Contract referencing them by reservationId is not orphaned in the
    // same fatal way a hard-deleted Reservation orphans its Contract — but
    // its tenantId now points at a User that no longer exists, which is
    // exactly what the PROGRESSED_CONTRACT_BLOCK guard above exists to
    // prevent by default.
    for (const archivedReservationId of archivedReservationIds) {
      await archiveContractForCancelledReservation({
        reservationId: archivedReservationId,
        actorId: actor?._id || null,
      }).catch((err) =>
        logger.warn({ err, archivedReservationId }, "Account delete: early-stage Contract archive failed (non-fatal)")
      );
      const remainingProgressedContracts = await Contract.find({
        reservationId: archivedReservationId,
        archivedAt: null,
      }).select("_id contractNumber status").lean();
      if (!remainingProgressedContracts.length) continue;

      if (isForceDelete) {
        // Reached this deletion specifically because force-delete signals
        // "archive these for me," not "silently leave them dangling."
        // Reuses the same blocker-checked archival as a Reservation
        // hard-delete — a Contract with real signed/final/billing evidence
        // is never silently archived, even under force-delete; it's left
        // for manual review instead.
        await archiveContractsForReservationHardDelete({
          reservationId: archivedReservationId,
          actorId: actor?._id || null,
        }).catch((err) =>
          logger.warn(
            { err, archivedReservationId, contracts: remainingProgressedContracts },
            "Account delete (force): progressed Contract(s) could not be auto-archived — needs manual review",
          )
        );
      } else {
        // Only reachable if a progressed Contract appeared after the
        // pre-check ran (a race) — log for manual review rather than
        // silently leaving it dangling.
        logger.warn(
          { archivedReservationId, contracts: remainingProgressedContracts },
          "Account delete: Contract(s) beyond early-stage still reference a reservation whose tenant User was just deleted — needs manual review",
        );
      }
    }

    // ── Post-transaction: recompute occupancy for rooms affected by force-deleted
    // active reservations (ensures immediate accuracy, not waiting for nightly job) ──
    if (isForceDelete && activeOccupancyCount > 0) {
      const affectedRoomIds = [
        ...new Set(activeOccupancyReservations.map((r) => String(r.roomId)).filter(Boolean)),
      ];
      if (affectedRoomIds.length > 0) {
        const { recalculateRoomOccupancy } = await import(
          "../services/occupancy/occupancyManager.js"
        );
        if (typeof recalculateRoomOccupancy === "function") {
          await Promise.allSettled(affectedRoomIds.map((roomId) =>
            recalculateRoomOccupancy(roomId).catch((err) =>
              logger.warn({ err, roomId }, "force delete: room reconcile failed (non-fatal)")
            )
          ));
        }
      }
    }

    // ── Clean up draft bills ───────────────────────────────────────────────────
    if (safeguards.draftBills > 0) {
      await Bill.deleteMany({
        userId: user._id,
        isArchived: false,
        status: "draft",
      });
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    await auditLogger.logDeletion(
      req,
      "user",
      userId,
      user.toObject(),
      "User account permanently deleted",
    );

    res.json({
      message: isForceDelete
        ? "User permanently deleted via force delete"
        : "User permanently deleted",
      deletedId: userId,
      hardDelete: true,
      forceDeleted: isForceDelete,
      deletedAccountLabel: DELETED_ACCOUNT_LABEL,
      cleanup: {
        archivedReservations: archivedReservationIds.length,
        deletedDraftBills: safeguards.draftBills,
      },
      safeguards,
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to delete user");
    next(error);
  }
};

// ============================================================================
// ACCOUNT STATUS MANAGEMENT
// ============================================================================

/**
 * PATCH /api/users/:userId/suspend
 * Suspend a user account.
 * Access: Admin | Owner
 */
export const suspendUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res
        .status(400)
        .json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res
        .status(404)
        .json({ error: "User not found", code: "USER_NOT_FOUND" });

    const canAccessTarget = await hasBranchAccessToTargetUser(
      targetUser,
      req.isOwner ? null : req.branchFilter,
    );
    if (!canAccessTarget) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    // Prevent suspending admins unless you're the owner
    if (
      (targetUser.role === "branch_admin" || targetUser.role === "owner") &&
      !req.isOwner
    )
      return res
        .status(403)
        .json({
          error: "Only the owner can suspend admin accounts",
          code: "ROLE_FORBIDDEN",
        });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    await targetUser.suspend(adminUser?._id, reason || "Suspended by admin");
    await invalidateUserSessions({ user: targetUser, reason: "account_suspended", req });
    await syncFirebaseUserDisabledState(targetUser.firebaseUid, true);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Account suspended: ${reason || "No reason provided"}`,
    );

    res.json({ message: "User suspended successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to suspend user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/reactivate
 * Reactivate a suspended or banned user account.
 * Access: Admin | Owner
 */
export const reactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res
        .status(400)
        .json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res
        .status(404)
        .json({ error: "User not found", code: "USER_NOT_FOUND" });

    const canAccessTarget = await hasBranchAccessToTargetUser(
      targetUser,
      req.isOwner ? null : req.branchFilter,
    );
    if (!canAccessTarget) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    if (targetUser.accountStatus === "active")
      return res
        .status(400)
        .json({ error: "User is already active", code: "ALREADY_ACTIVE" });

    // Only owner can reactivate banned users
    if (targetUser.accountStatus === "banned" && !req.isOwner)
      return res
        .status(403)
        .json({
          error: "Only the owner can reactivate banned accounts",
          code: "ROLE_FORBIDDEN",
        });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    const invalidation = await invalidateUserSessions({ user: targetUser, reason: "account_reactivated", req });
    await targetUser.reactivate(adminUser?._id);
    await syncFirebaseUserDisabledState(targetUser.firebaseUid, false);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Account reactivated from ${oldData.accountStatus}`,
    );

    res.json({ message: "User reactivated successfully", user: targetUser, sessionCleanupComplete: !invalidation.failures.length });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to reactivate user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/restore
 * Restore an archived user account.
 * Access: Admin | Owner
 */
export const restoreUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res
        .status(400)
        .json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res
        .status(404)
        .json({ error: "User not found", code: "USER_NOT_FOUND" });
    }

    const canAccessTarget = await hasBranchAccessToTargetUser(
      targetUser,
      req.isOwner ? null : req.branchFilter,
    );

    if (!canAccessTarget) {
      return res.status(404).json({
        error: "User not found or access denied",
        code: "USER_NOT_FOUND",
      });
    }

    if (!req.isOwner && ["branch_admin", "owner"].includes(targetUser.role)) {
      return res.status(403).json({
        error: "Only the owner can restore admin accounts",
        code: "ROLE_FORBIDDEN",
      });
    }

    if (!targetUser.isArchived) {
      return res.status(400).json({
        error: "User is not archived",
        code: "USER_NOT_ARCHIVED",
      });
    }

    const adminUser = await User.findOne({ firebaseUid: req.user.uid })
      .select("_id")
      .lean();
    const oldData = targetUser.toObject();

    const invalidation = await invalidateUserSessions({ user: targetUser, reason: "account_restored", req });
    await targetUser.restore(adminUser?._id || null);
    await syncFirebaseUserDisabledState(targetUser.firebaseUid, false);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      "User restored from archive",
    );

    res.json({ message: "User restored successfully", user: targetUser, sessionCleanupComplete: !invalidation.failures.length });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to restore user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/archive
 * Soft-delete (archive) a user account.
 * Access: Admin | Owner
 */
export const archiveUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    }

    const canAccessTarget = await hasBranchAccessToTargetUser(
      targetUser,
      req.isOwner ? null : req.branchFilter,
    );
    if (!canAccessTarget) {
      return res.status(404).json({ error: "User not found or access denied", code: "USER_NOT_FOUND" });
    }

    if (!req.isOwner && ["branch_admin", "owner"].includes(targetUser.role)) {
      return res.status(403).json({ error: "Only the owner can archive admin accounts", code: "ROLE_FORBIDDEN" });
    }

    if (targetUser.isArchived) {
      return res.json({ message: "User already archived", archived: true });
    }

    const actor = await User.findOne({ firebaseUid: req.user.uid }).select("_id").lean();
    const oldData = targetUser.toObject();

    await targetUser.archive(actor?._id || null);
    await invalidateUserSessions({ user: targetUser, reason: "account_archived", req });
    await syncFirebaseUserDisabledState(targetUser.firebaseUid, true);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      "User archived",
    );

    return res.json({ message: "User archived successfully", archived: true });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to archive user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/ban
 * Ban a user account permanently.
 * Access: Owner only
 */
export const banUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res
        .status(400)
        .json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res
        .status(404)
        .json({ error: "User not found", code: "USER_NOT_FOUND" });

    // Cannot ban owners
    if (targetUser.role === "owner")
      return res
        .status(403)
        .json({ error: "Cannot ban owner accounts", code: "ROLE_FORBIDDEN" });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    await targetUser.ban(adminUser?._id, reason || "Banned by admin");
    await invalidateUserSessions({ user: targetUser, reason: "account_banned", req });
    await syncFirebaseUserDisabledState(targetUser.firebaseUid, true);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Account banned: ${reason || "No reason provided"}`,
    );

    res.json({ message: "User banned successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to ban user");
    next(error);
  }
};

/**
 * Get user's stay information and history
 * Returns current stay and past reservations
 */
export const getMyStays = async (req, res, next) => {
  try {
    // Find user in database
    const dbUser = await User.findOne({ firebaseUid: req.user.uid });

    if (!dbUser) {
      return res.status(404).json({
        error: "User not found in database",
        code: "USER_NOT_FOUND",
      });
    }

    // Get all reservations for this user
    const allReservations = await Reservation.find({ userId: dbUser._id })
      .populate("roomId", "name branch type price bedType amenities images")
      .sort({ createdAt: -1 });

    // Separate current and past stays
    const currentDate = new Date();

    // Find active/current stays
    const currentStays = allReservations.filter((reservation) => {
      const status = reservation.status;
      return hasReservationStatus(status, ACTIVE_STAY_STATUS_QUERY);
    });

    // Past stays (completed or cancelled)
    const pastStays = allReservations.filter((reservation) => {
      const status = reservation.status;
      return hasReservationStatus(status, PAST_STAY_STATUS_QUERY);
    });

    // Calculate stay statistics
    const totalStays = allReservations.length;
    const completedStays = pastStays.filter((reservation) =>
      hasReservationStatus(
        reservation.reservationStatus || reservation.status,
        "moveOut",
      ),
    ).length;
    const totalNights = pastStays.reduce((sum, reservation) => {
      const moveInDate = readMoveInDate(reservation);
      const moveOutDate = readMoveOutDate(reservation);
      if (moveInDate && moveOutDate) {
        const nights = dayjs(moveOutDate).diff(
          dayjs(moveInDate),
          "day",
        );
        return sum + Math.max(0, nights);
      }
      return sum;
    }, 0);

    res.json({
      currentStays,
      pastStays,
      stats: {
        totalStays,
        completedStays,
        totalNights,
        memberSince: dbUser.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PERMISSION MANAGEMENT
// ============================================================================

/**
 * PATCH /api/users/:userId/permissions
 * Update an admin user's permissions array.
 * Access: Owner only
 */
export const updatePermissions = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res
        .status(400)
        .json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    if (!Array.isArray(permissions))
      return res
        .status(400)
        .json({
          error: "Permissions must be an array",
          code: "INVALID_PERMISSIONS",
        });

    const normalizedPermissions = Array.from(
      new Set(
        permissions
          .filter((p) => typeof p === "string")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    );

    // Validate each permission key
    const invalid = normalizedPermissions.filter(
      (p) => !ALL_PERMISSIONS.includes(p),
    );
    if (invalid.length > 0)
      return res.status(400).json({
        error: `Invalid permissions: ${invalid.join(", ")}`,
        code: "INVALID_PERMISSION_KEYS",
      });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res
        .status(404)
        .json({ error: "User not found", code: "USER_NOT_FOUND" });

    // Only allow modifying branch_admin permissions (not owner or applicant/tenant)
    if (targetUser.role !== "branch_admin")
      return res.status(400).json({
        error: "Permissions can only be set on branch admin accounts",
        code: "ROLE_NOT_ADMIN",
      });

    const oldData = targetUser.toObject();
    const nextPermissions = ALL_PERMISSIONS.filter((p) =>
      normalizedPermissions.includes(p),
    );
    if (JSON.stringify(nextPermissions) === JSON.stringify(targetUser.permissions || [])) {
      return res.json({ message: "Permissions unchanged", user: targetUser, sessionCleanupComplete: true });
    }
    const invalidation = await invalidateUserSessions({ user: targetUser, reason: "permissions_changed", req });
    targetUser.permissions = nextPermissions;
    await targetUser.save();

    const oldPermissions = Array.isArray(oldData.permissions) ? oldData.permissions : [];
    const added = nextPermissions.filter((p) => !oldPermissions.includes(p));
    const removed = oldPermissions.filter((p) => !nextPermissions.includes(p));
    const diffDetails = [
      added.length ? `+${added.join(", +")}` : null,
      removed.length ? `-${removed.join(", -")}` : null,
    ].filter(Boolean).join(" | ");

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Permissions updated [${diffDetails || "reordered"}]: ${targetUser.permissions.join(", ") || "(none)"}`,
    );

    res.json({ message: "Permissions updated successfully", user: targetUser, sessionCleanupComplete: !invalidation.failures.length });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update user permissions");
    next(error);
  }
};
