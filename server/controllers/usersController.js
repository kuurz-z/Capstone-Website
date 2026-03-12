/**
 * User Controllers
 * Extracted from routes for cleaner separation.
 */

import dayjs from "dayjs";
import { User, Reservation, Room } from "../models/index.js";
import { getAuth } from "../config/firebase.js";
import auditLogger from "../utils/auditLogger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";

const VALID_BRANCHES = ["gil-puyat", "guadalupe"];

/**
 * POST /api/users
 *
 * Admin-created user account.
 * Creates a Firebase Auth user + MongoDB record.
 * Sends a password-reset email so the user can set their own password.
 *
 * Access: Admin (applicant only) | Super Admin (applicant or admin)
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
    if (allowedRole === "superAdmin") {
      return res.status(403).json({
        error: "Cannot create Super Admin accounts",
        code: "ROLE_FORBIDDEN",
      });
    }
    if (allowedRole === "admin" && !req.isSuperAdmin) {
      return res.status(403).json({
        error: "Only Super Admins can create admin accounts",
        code: "ROLE_FORBIDDEN",
      });
    }
    if (!["applicant", "admin"].includes(allowedRole)) {
      return res.status(400).json({
        error: "Role must be 'applicant' or 'admin'",
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
    if (allowedRole === "admin") {
      await auth.setCustomUserClaims(firebaseUid, { admin: true });
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
      tenantStatus: null,
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

    // Get counts by role
    const roleCounts = await User.aggregate([
      { $match: matchQuery },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    // Get counts by branch (for super admin)
    let branchCounts = [];
    if (req.isSuperAdmin) {
      branchCounts = await User.aggregate([
        { $group: { _id: "$branch", count: { $sum: 1 } } },
      ]);
    }

    // Get total and active counts
    const total = await User.countDocuments(matchQuery);
    const activeCount = await User.countDocuments({
      ...matchQuery,
      isActive: true,
    });
    const verifiedCount = await User.countDocuments({
      ...matchQuery,
      isEmailVerified: true,
    });

    // Format response
    const stats = {
      total,
      activeCount,
      verifiedCount,
      byRole: { user: 0, tenant: 0, admin: 0, superAdmin: 0 },
      byBranch: {},
    };

    roleCounts.forEach((item) => {
      if (item._id) stats.byRole[item._id] = item.count;
    });
    branchCounts.forEach((item) => {
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
      .select("-__v");

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
      username: { $regex: new RegExp(`^${trimmedUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
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
      page = 1,
      limit = 20,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    // Build query with branch filter (exclude archived/soft-deleted users)
    const query = { isArchived: { $ne: true } };

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

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions = { [sort]: sortOrder };

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select("-__v"),
      User.countDocuments(query),
    ]);


    res.json({
      users,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
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
      "username", "firstName", "lastName", "email", "phone", "profileImage",
      "role", "branch", "isActive",
      // Extended profile fields
      "address", "city", "gender", "dateOfBirth",
      "emergencyContact", "emergencyPhone",
      "studentId", "school", "yearLevel",
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

    // Only super admins can change roles
    if (updateData.role && !req.isSuperAdmin) {
      delete updateData.role;
    }

    // Only super admins can change branch assignment
    if (updateData.branch !== undefined && !req.isSuperAdmin) {
      delete updateData.branch;
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
      console.error("⚠️ Firebase deletion failed:", fbErr.message);
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
 * Access: Admin | Super Admin
 */
export const suspendUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res.status(400).json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });

    // Prevent suspending admins unless you're a super admin
    if ((targetUser.role === "admin" || targetUser.role === "superAdmin") && !req.isSuperAdmin)
      return res.status(403).json({ error: "Only super admins can suspend admin accounts", code: "ROLE_FORBIDDEN" });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    await targetUser.suspend(adminUser?._id, reason || "Suspended by admin");

    await auditLogger.logModification(req, "user", userId, oldData, targetUser.toObject(),
      `Account suspended: ${reason || "No reason provided"}`);

    res.json({ message: "User suspended successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to suspend user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/reactivate
 * Reactivate a suspended or banned user account.
 * Access: Admin | Super Admin
 */
export const reactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res.status(400).json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });

    if (targetUser.accountStatus === "active")
      return res.status(400).json({ error: "User is already active", code: "ALREADY_ACTIVE" });

    // Only super admin can reactivate banned users
    if (targetUser.accountStatus === "banned" && !req.isSuperAdmin)
      return res.status(403).json({ error: "Only super admins can reactivate banned accounts", code: "ROLE_FORBIDDEN" });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    await targetUser.reactivate(adminUser?._id);

    await auditLogger.logModification(req, "user", userId, oldData, targetUser.toObject(),
      `Account reactivated from ${oldData.accountStatus}`);

    res.json({ message: "User reactivated successfully", user: targetUser });
  } catch (error) {
    await auditLogger.logError(req, error, "Failed to reactivate user");
    next(error);
  }
};

/**
 * PATCH /api/users/:userId/ban
 * Ban a user account permanently.
 * Access: Super Admin only
 */
export const banUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!userId.match(/^[0-9a-fA-F]{24}$/))
      return res.status(400).json({ error: "Invalid user ID format", code: "INVALID_USER_ID" });

    const targetUser = await User.findById(userId);
    if (!targetUser)
      return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });

    // Cannot ban super admins
    if (targetUser.role === "superAdmin")
      return res.status(403).json({ error: "Cannot ban super admin accounts", code: "ROLE_FORBIDDEN" });

    const adminUser = await User.findOne({ firebaseUid: req.user.uid });
    const oldData = targetUser.toObject();

    await targetUser.ban(adminUser?._id, reason || "Banned by admin");

    await auditLogger.logModification(req, "user", userId, oldData, targetUser.toObject(),
      `Account banned: ${reason || "No reason provided"}`);

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
      return status === "confirmed" || status === "checked-in";
    });

    // Past stays (completed or cancelled)
    const pastStays = allReservations.filter((reservation) => {
      const status = reservation.status;
      return status === "checked-out" || status === "cancelled";
    });

    // Calculate stay statistics
    const totalStays = allReservations.length;
    const completedStays = pastStays.filter(
      (r) => r.reservationStatus === "checked-out",
    ).length;
    const totalNights = pastStays.reduce((sum, reservation) => {
      if (reservation.checkInDate && reservation.checkOutDate) {
        const nights = dayjs(reservation.checkOutDate).diff(
          dayjs(reservation.checkInDate),
          "day"
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
