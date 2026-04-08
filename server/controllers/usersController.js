/**
 * User Controllers
 * Extracted from routes for cleaner separation.
 */

import dayjs from "dayjs";
import { User, Reservation, Room } from "../models/index.js";
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
  PAST_STAY_STATUS_QUERY,
  hasReservationStatus,
  readMoveInDate,
  readMoveOutDate,
} from "../utils/lifecycleNaming.js";

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
  "username",
  "firstName",
  "lastName",
  "email",
  "phone",
  "role",
  "branch",
  "accountStatus",
  "isActive",
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

const canTransitionTenantStatus = (fromStatus, toStatus) => {
  if (fromStatus === toStatus) return true;
  return (TENANT_STATUS_TRANSITIONS[fromStatus] || []).includes(toStatus);
};

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
    const { email, username, firstName, lastName, phone, role, password } =
      req.body;

    // --- Validate required fields ---
    if (!email || !username || !firstName || !lastName || !password) {
      return res.status(400).json({
        error:
          "Missing required fields: email, username, firstName, lastName, and password are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // --- Validate password strength ---
    if (password.length < 6) {
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
      password,
      displayName: `${firstName} ${lastName}`,
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
      branch: null, // branch is assigned when user becomes tenant
      role: allowedRole,
      isEmailVerified: false,
      isActive: true,
      tenantStatus: "applicant",
      permissions: DEFAULT_PERMISSIONS[allowedRole] || [],
    });

    await user.save();

    // --- Generate password reset link ---
    try {
      const resetLink = await auth.generatePasswordResetLink(
        email.toLowerCase(),
      );
      // The link is logged for now; could be emailed via your email service
    } catch (resetErr) {
      // Non-fatal — user can still use "Forgot Password" later
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
    const matchQuery = req.branchFilter ? { branch: req.branchFilter } : {};

    const [statsResult = {}] = await User.aggregate([
      { $match: matchQuery },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                activeCount: {
                  $sum: {
                    $cond: [{ $eq: ["$accountStatus", "active"] }, 1, 0],
                  },
                },
                verifiedCount: {
                  $sum: {
                    $cond: [{ $eq: ["$isEmailVerified", true] }, 1, 0],
                  },
                },
              },
            },
          ],
          byRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }],
          byAccountStatus: [
            { $group: { _id: "$accountStatus", count: { $sum: 1 } } },
          ],
          byBranch: req.isOwner
            ? [{ $group: { _id: "$branch", count: { $sum: 1 } } }]
            : [],
        },
      },
    ]);

    const totals = statsResult.totals?.[0] || {
      total: 0,
      activeCount: 0,
      verifiedCount: 0,
    };

    // Format response
    const stats = {
      total: totals.total,
      activeCount: totals.activeCount,
      verifiedCount: totals.verifiedCount,
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

    if (req.branchFilter) {
      query.branch = req.branchFilter;
    } else if (branch) {
      query.branch = branch;
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
      query.accountStatus = accountStatus;
    }

    if (search?.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
      query.$or = LIST_SEARCH_FIELDS.map((field) => ({ [field]: searchRegex }));
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

    res.json({
      users,
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

    const query = { _id: userId };
    if (req.branchFilter) {
      query.branch = req.branchFilter;
    }

    const user = await User.findOne(query).select("-__v");

    if (!user) {
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

    const ALLOWED_ADMIN_UPDATE_FIELDS = [
      "username",
      "firstName",
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
      "dateOfBirth",
      "emergencyContact",
      "emergencyPhone",
      "studentId",
      "school",
      "yearLevel",
    ];

    // Build update object from whitelist only
    const updateData = {};
    for (const field of ALLOWED_ADMIN_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
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

    if (updateData.tenantStatus !== undefined) {
      const nextStatus = String(updateData.tenantStatus).trim();
      if (!VALID_TENANT_STATUSES.includes(nextStatus)) {
        return res.status(400).json({
          error: `Invalid tenant status. Must be one of: ${VALID_TENANT_STATUSES.join(", ")}`,
          code: "INVALID_TENANT_STATUS",
        });
      }

      const currentRole = existingUser.role;
      const nextRole = updateData.role || currentRole;
      if (["branch_admin", "owner"].includes(nextRole)) {
        return res.status(400).json({
          error: "Admin accounts cannot use tenant status transitions",
          code: "ROLE_TENANT_STATUS_CONFLICT",
        });
      }

      if (!canTransitionTenantStatus(existingUser.tenantStatus, nextStatus)) {
        return res.status(400).json({
          error: `Invalid tenant status transition: ${existingUser.tenantStatus} -> ${nextStatus}`,
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

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-__v");

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
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update user");
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

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

    // Delete Firebase account
    try {
      const auth = getAuth();
      if (auth && user.firebaseUid) await auth.deleteUser(user.firebaseUid);
    } catch (fbErr) {
      logger.warn(
        { err: fbErr, requestId: req.id },
        "Firebase deletion failed",
      );
    }

    // Hard delete from MongoDB
    await User.findByIdAndDelete(userId);

    // Log user deletion
    await auditLogger.logDeletion(
      req,
      "user",
      userId,
      user.toObject(),
      "User account permanently deleted",
    );

    res.json({
      message: "User deleted successfully",
      deletedId: userId,
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

    await targetUser.reactivate(adminUser?._id);

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Account reactivated from ${oldData.accountStatus}`,
    );

    res.json({ message: "User reactivated successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to reactivate user");
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
    targetUser.permissions = ALL_PERMISSIONS.filter((p) =>
      normalizedPermissions.includes(p),
    );
    await targetUser.save();

    await auditLogger.logModification(
      req,
      "user",
      userId,
      oldData,
      targetUser.toObject(),
      `Permissions updated: ${targetUser.permissions.join(", ") || "(none)"}`,
    );

    res.json({ message: "Permissions updated successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to update user permissions");
    next(error);
  }
};
