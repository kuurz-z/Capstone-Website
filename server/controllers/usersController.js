/**
 * User Controllers
 * Extracted from routes for cleaner separation.
 */

import { User, Reservation, Room } from "../models/index.js";
import { getAuth } from "../config/firebase.js";
import auditLogger from "../utils/auditLogger.js";

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
export const createUser = async (req, res) => {
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
      console.log(`Password reset link generated for ${email}`);
      // The link is logged for now; could be emailed via your email service
    } catch (resetErr) {
      console.warn(
        `Could not generate password reset link: ${resetErr.message}`,
      );
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

    console.log(`User created by admin: ${email} (${allowedRole})`);
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
    console.error("Create user error:", error);

    // --- Rollback: delete Firebase user if MongoDB save failed ---
    if (firebaseUid) {
      try {
        const auth = getAuth();
        await auth.deleteUser(firebaseUid);
        console.log(`Rolled back Firebase user ${firebaseUid}`);
      } catch (deleteErr) {
        if (deleteErr.code !== "auth/user-not-found") {
          console.error("Failed to rollback Firebase user:", deleteErr.message);
        }
      }
    }

    // Firebase-specific errors
    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "Email already registered in Firebase",
        code: "EMAIL_TAKEN",
      });
    }
    if (error.code === "auth/invalid-email") {
      return res.status(400).json({
        error: "Invalid email format",
        code: "INVALID_EMAIL",
      });
    }

    // MongoDB duplicate key
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        error: `${field} already exists`,
        code: "DUPLICATE_FIELD",
      });
    }

    // Validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    await auditLogger.logError(req, error, "Failed to create user");
    res.status(500).json({
      error: "Failed to create user",
      details: error.message,
      code: "CREATE_USER_ERROR",
    });
  }
};

export const getUserStats = async (req, res) => {
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

    console.log(
      `✅ Retrieved user stats for ${req.userBranch || "all"} branch(es)`,
    );
    res.json(stats);
  } catch (error) {
    console.error("❌ Fetch user stats error:", error);
    res.status(500).json({
      error: "Failed to fetch user statistics",
      details: error.message,
      code: "FETCH_STATS_ERROR",
    });
  }
};

export const getUsersByBranch = async (req, res) => {
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

    console.log(
      `✅ Super Admin retrieved ${users.length} users for ${branch || "no"} branch`,
    );
    res.json(users);
  } catch (error) {
    console.error("❌ Fetch branch users error:", error);
    res.status(500).json({
      error: "Failed to fetch branch users",
      details: error.message,
      code: "FETCH_BRANCH_USERS_ERROR",
    });
  }
};

export const getEmailByUsername = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        error: "Username is required",
        code: "MISSING_USERNAME",
      });
    }

    const trimmedUsername = username.trim();
    console.log(`🔍 Looking up username: "${trimmedUsername}"`);

    const user = await User.findOne({
      username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") },
    }).select("email username");

    if (!user) {
      console.log(`❌ Username not found: "${trimmedUsername}"`);
      return res.status(404).json({
        error: "Username not found",
        code: "USERNAME_NOT_FOUND",
      });
    }

    console.log(
      `✅ Email lookup for username: ${trimmedUsername} -> ${user.email}`,
    );
    res.json({ email: user.email });
  } catch (error) {
    console.error("❌ Username lookup error:", error);
    res.status(500).json({
      error: "Failed to lookup username",
      details: error.message,
      code: "USERNAME_LOOKUP_ERROR",
    });
  }
};

export const getUsers = async (req, res) => {
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

    // Build query with branch filter
    const query = {};

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

    console.log(
      `✅ Retrieved ${users.length} users for ${req.userBranch || "all"} branch(es)`,
    );

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
    console.error("❌ Fetch users error:", error);
    res.status(500).json({
      error: "Failed to fetch users",
      details: error.message,
      code: "FETCH_USERS_ERROR",
    });
  }
};

export const getUserById = async (req, res) => {
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

    console.log(`✅ Retrieved user: ${user.email}`);
    res.json(user);
  } catch (error) {
    console.error("❌ Fetch user error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      error: "Failed to fetch user",
      details: error.message,
      code: "FETCH_USER_ERROR",
    });
  }
};

export const updateUser = async (req, res) => {
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

    const updateData = { ...req.body };

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

    console.log(`✅ User updated: ${user.email}`);
    res.json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("❌ Update user error:", error);
    await auditLogger.logError(req, error, "Failed to update user");

    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      error: "Failed to update user",
      details: error.message,
      code: "UPDATE_USER_ERROR",
    });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Log user deletion
    await auditLogger.logDeletion(
      req,
      "user",
      userId,
      user.toObject(),
      "User account deleted",
    );

    console.log(`✅ User deleted: ${user.email}`);
    res.json({
      message: "User deleted successfully",
      deletedId: userId,
    });
  } catch (error) {
    console.error("❌ Delete user error:", error);
    await auditLogger.logError(req, error, "Failed to delete user");

    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      error: "Failed to delete user",
      details: error.message,
      code: "DELETE_USER_ERROR",
    });
  }
};

/**
 * Get user's stay information and history
 * Returns current stay and past reservations
 */
export const getMyStays = async (req, res) => {
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
      const status = reservation.reservationStatus;
      return status === "confirmed" || status === "checked-in";
    });

    // Past stays (completed or cancelled)
    const pastStays = allReservations.filter((reservation) => {
      const status = reservation.reservationStatus;
      return status === "checked-out" || status === "cancelled";
    });

    // Calculate stay statistics
    const totalStays = allReservations.length;
    const completedStays = pastStays.filter(
      (r) => r.reservationStatus === "checked-out",
    ).length;
    const totalNights = pastStays.reduce((sum, reservation) => {
      if (reservation.checkInDate && reservation.checkOutDate) {
        const nights = Math.ceil(
          (new Date(reservation.checkOutDate) -
            new Date(reservation.checkInDate)) /
            (1000 * 60 * 60 * 24),
        );
        return sum + nights;
      }
      return sum;
    }, 0);

    console.log(`✅ Retrieved stay information for ${dbUser.email}`);
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
    console.error("❌ Fetch stays error:", error);
    res.status(500).json({
      error: "Failed to fetch stay information",
      details: error.message,
      code: "FETCH_STAYS_ERROR",
    });
  }
};
