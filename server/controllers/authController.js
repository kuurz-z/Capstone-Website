/**
 * Authentication Controllers
 * Extracted from routes for cleaner separation.
 */

import { getAuth } from "../config/firebase.js";
import { User } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import {} from "../middleware/validation.js";

const VALID_BRANCHES = ["gil-puyat", "guadalupe"];
const VALID_ROLES = ["applicant", "tenant", "admin", "superAdmin"];

export const register = async (req, res) => {
  try {
    console.log("🧪 REGISTER DEBUG START ==================");
    console.log("📦 req.body:", req.body);
    console.log("🧼 req.sanitizedData:", req.sanitizedData);
    console.log("🔥 Firebase user:", {
      uid: req.user?.uid,
      email: req.user?.email,
      email_verified: req.user?.email_verified,
    });
    console.log("🧪 REGISTER DEBUG END ====================");

    // Sanitize and validate input
    const data = req.sanitizedData;

    const username = data.username;
    const firstName = data.firstName;
    const lastName = data.lastName;
    const phone = data.phone; // may be undefined
    const branch = data.branch; // may be undefined
    const email = data.email; // may be undefined (for Gmail users)

    // Validate required fields
    if (!username || !firstName || !lastName) {
      // Log registration attempt with missing fields
      await auditLogger.logError(
        req,
        new Error("Missing required fields"),
        "Registration attempt with missing fields",
      );
      return res.status(400).json({
        error:
          "Missing required fields: username, firstName, and lastName are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Validate branch value (only if provided)
    // Allow empty branch for Gmail users - they will select via modal after login
    if (branch && !VALID_BRANCHES.includes(branch)) {
      // Log registration attempt with invalid branch
      await auditLogger.logError(
        req,
        new Error(`Invalid branch: ${branch}`),
        "Registration attempt with invalid branch",
      );
      return res.status(400).json({
        error: `Invalid branch. Must be one of: ${VALID_BRANCHES.join(", ")}`,
        code: "INVALID_BRANCH",
      });
    }

    // Check if user already exists in MongoDB
    const existingUser = await User.findOne({ firebaseUid: req.user.uid });

    if (existingUser) {
      console.log(`⚠️ User already registered: ${existingUser.email}`);
      // Log duplicate registration attempt
      await auditLogger.logRegistration(
        req,
        existingUser,
        false,
        `Duplicate registration attempt - User ${existingUser.email} already exists`,
      );
      return res.status(400).json({
        error: "User already registered",
        code: "USER_ALREADY_EXISTS",
        user: {
          id: existingUser._id,
          email: existingUser.email,
          username: existingUser.username,
          firstName: existingUser.firstName,
          lastName: existingUser.lastName,
          branch: existingUser.branch,
          role: existingUser.role,
        },
      });
    }

    // Check if username is already taken
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      // Log registration attempt with taken username
      await auditLogger.logError(
        req,
        new Error(`Username taken: ${username}`),
        "Registration attempt with duplicate username",
      );
      return res.status(400).json({
        error: "Username already taken. Please choose another one.",
        code: "USERNAME_TAKEN",
      });
    }
    console.log("🧾 Creating user with:", {
      firebaseUid: req.user.uid,
      email: req.user.email,
      username,
      firstName,
      lastName,
      phone,
      branch,
    });

    // Save user data to MongoDB
    // NOTE: Firebase Auth is the source of truth for email verification
    // We sync the verification status from Firebase (req.user.email_verified)
    const user = new User({
      firebaseUid: req.user.uid,
      email: req.user.email,
      username,
      firstName,
      lastName,
      phone,
      branch,
      role: "applicant",
      isEmailVerified: req.user.email_verified || false, // Synced from Firebase
      tenantStatus: "registered",
    });

    await user.save();

    // Log successful registration
    await auditLogger.logRegistration(
      req,
      user,
      true,
      `New applicant ${user.email} registered with username ${username}${branch ? ` for branch ${branch}` : ""}`,
    );

    console.log(
      `✅ User registered successfully: ${user.email} (${user.branch})`,
    );
    res.status(201).json({
      message: "User registered successfully. Please verify your email.",
      userId: req.user.uid,
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
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Registration error:", error);

    // Log registration error
    await auditLogger.logError(req, error, "Registration error");

    // CRITICAL: Clean up Firebase user if MongoDB registration fails
    // This prevents orphaned Firebase accounts when backend registration errors
    if (req.user?.uid) {
      try {
        const auth = getAuth();
        await auth.deleteUser(req.user.uid);
        console.log(
          `🗑️ Rolled back Firebase user ${req.user.uid} after registration error`,
        );
      } catch (deleteError) {
        // Only warn if the user actually existed (not already deleted)
        if (deleteError.code !== "auth/user-not-found") {
          console.error(
            "⚠️ Failed to rollback Firebase user:",
            deleteError.message,
          );
        }
      }
    }

    // Handle duplicate key errors (email or username already exists)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        error: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
        code: "DUPLICATE_FIELD",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      console.error("❌ Mongoose validation keys:", Object.keys(error.errors));
      console.error("❌ Mongoose validation details:", error.errors);

      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        fields: Object.keys(error.errors),
        code: "VALIDATION_ERROR",
      });
    }

    res.status(500).json({
      error: "Registration failed. Please try again.",
      details: error.message,
      code: "REGISTRATION_ERROR",
    });
  }
};

export const login = async (req, res) => {
  try {
    // Check if this is just a check (for Google sign-in flow)
    const isCheckOnly = req.query.checkOnly === "true";

    // Find user in database using Firebase UID from verified token
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      console.log(`❌ User not found in database: ${req.user.uid}`);
      // Only log if this is a real login attempt, not a check
      if (!isCheckOnly) {
        await auditLogger.logLogin(
          req,
          req.user.email || "unknown",
          false,
          "User not found in database - Registration required",
        );
      }
      return res.status(404).json({
        error: "User not found in database. Please register first.",
        code: "USER_NOT_FOUND",
      });
    }

    // Check if account is active
    if (!user.isActive) {
      console.log(`⚠️ Inactive account login attempt: ${user.email}`);
      // Log failed login attempt
      await auditLogger.logLogin(
        req,
        user,
        false,
        "Inactive account login attempt",
      );
      return res.status(403).json({
        error: "Your account is inactive. Please contact support.",
        code: "ACCOUNT_INACTIVE",
      });
    }

    // Sync email verification status from Firebase
    // Firebase is the source of truth - we just mirror the status in our DB
    const firebaseEmailVerified = req.user.email_verified || false;
    if (user.isEmailVerified !== firebaseEmailVerified) {
      user.isEmailVerified = firebaseEmailVerified;
      // If email is now verified and tenantStatus is not 'registered', update it
      if (firebaseEmailVerified && user.tenantStatus !== "registered") {
        user.tenantStatus = "registered";
      }
      await user.save();
      console.log(
        `✅ Synced verification for ${user.email}: ${firebaseEmailVerified}`,
      );
    }

    // Log successful login (not for checkOnly)
    if (!isCheckOnly) {
      await auditLogger.logLogin(req, user, true);
    }

    console.log(`✅ Login successful: ${user.email} (${user.role})`);
    res.json({
      message: "Login successful",
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
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    // Log error
    await auditLogger.logError(req, error, "Login error");
    res.status(500).json({
      error: "Login failed. Please try again.",
      details: error.message,
      code: "LOGIN_ERROR",
    });
  }
};

export const logout = async (req, res) => {
  console.log("🔐 [Server] Logout endpoint called");
  console.log("🔐 [Server] User from token:", req.user?.email || "unknown");
  try {
    // Get user info for audit logging
    const user = await User.findOne({ firebaseUid: req.user.uid });
    console.log(
      "🔐 [Server] User from DB:",
      user?.email || "not found",
      "Role:",
      user?.role || "N/A",
    );

    if (!user) {
      // User not in database but authenticated with Firebase - still log logout
      console.log("🔐 [Server] Logging logout for Firebase-only user...");
      await auditLogger.logLogout(req, req.user.email);
      console.log(`✅ Logout successful (Firebase user): ${req.user.email}`);
      return res.json({
        message: "Logged out successfully",
        code: "LOGOUT_SUCCESS",
      });
    }

    // Log logout event for authenticated user with full details
    console.log("🔐 [Server] Logging logout for DB user...");
    await auditLogger.logLogout(req, user);

    console.log(`✅ Logout successful: ${user.email} (${user.role})`);
    res.json({
      message: "Logged out successfully",
      code: "LOGOUT_SUCCESS",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    // Log logout error
    await auditLogger.logError(req, error, "Logout error");
    res.status(500).json({
      error: "Logout failed",
      details: error.message,
      code: "LOGOUT_ERROR",
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      console.log(`❌ Profile not found for Firebase UID: ${req.user.uid}`);
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log(`✅ Profile fetched: ${user.email}`);
    res.json({
      id: user._id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      branch: user.branch,
      role: user.role,
      tenantStatus: user.tenantStatus,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("❌ Profile fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch profile",
      details: error.message,
      code: "PROFILE_FETCH_ERROR",
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    // Sanitize input
    const firstName = req.body.firstName
      ? sanitizeName(req.body.firstName)
      : null;
    const lastName = req.body.lastName ? sanitizeName(req.body.lastName) : null;
    const phone = req.body.phone ? sanitizePhone(req.body.phone) : undefined;
    const profileImage =
      req.body.profileImage !== undefined ? req.body.profileImage : undefined;

    // Validate at least one field is provided
    if (
      !firstName &&
      !lastName &&
      phone === null &&
      profileImage === undefined
    ) {
      return res.status(400).json({
        error:
          "At least one field (firstName, lastName, phone, or profileImage) must be provided",
        code: "NO_UPDATE_DATA",
      });
    }

    // Build update object with only provided fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined && phone !== null) updateData.phone = phone;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      updateData,
      { new: true, runValidators: true },
    );

    if (!user) {
      console.log(`❌ User not found for update: ${req.user.uid}`);
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log(`✅ Profile updated: ${user.email}`);
    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        profileImage: user.profileImage,
        branch: user.branch,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Profile update error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    res.status(500).json({
      error: "Failed to update profile",
      details: error.message,
      code: "PROFILE_UPDATE_ERROR",
    });
  }
};

export const updateBranch = async (req, res) => {
  try {
    const { branch } = req.body;

    // Validate branch value
    if (!branch) {
      return res.status(400).json({
        error: "Branch is required",
        code: "MISSING_BRANCH",
      });
    }

    if (!["gil-puyat", "guadalupe"].includes(branch)) {
      return res.status(400).json({
        error: "Invalid branch. Must be 'gil-puyat' or 'guadalupe'",
        code: "INVALID_BRANCH",
      });
    }

    // Update user's branch
    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { branch },
      { new: true, runValidators: true },
    );

    if (!user) {
      console.log(`❌ User not found for branch update: ${req.user.uid}`);
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    console.log(`✅ Branch updated for ${user.email}: ${branch}`);
    res.json({
      message: "Branch updated successfully",
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
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Branch update error:", error);
    res.status(500).json({
      error: "Failed to update branch",
      details: error.message,
      code: "BRANCH_UPDATE_ERROR",
    });
  }
};

export const setRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    // Validate required fields
    if (!userId || !role) {
      return res.status(400).json({
        error: "Missing required fields: userId and role are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
        code: "INVALID_ROLE",
      });
    }

    // Validate userId format
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    // Set Firebase custom claims based on role
    const claims = {};
    if (role === "admin") {
      claims.admin = true;
    } else if (role === "superAdmin") {
      claims.superAdmin = true;
      claims.admin = true; // SuperAdmins also have admin privileges
    }

    // Find user by MongoDB _id
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User not found for role update: ${userId}`);
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Set custom claims in Firebase Auth
    // This allows the user to have admin/superAdmin access on the frontend
    const auth = getAuth();

    if (!auth) {
      return res.status(503).json({
        error:
          "Authentication is temporarily unavailable. Firebase Admin is not initialized.",
        code: "FIREBASE_ADMIN_NOT_INITIALIZED",
      });
    }

    await auth.setCustomUserClaims(user.firebaseUid, claims);

    // Update role in MongoDB database
    user.role = role;
    await user.save();

    console.log(`✅ User role updated: ${user.email} → ${role}`);
    res.json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Role update error:", error);

    // Handle Firebase errors
    if (error.code && error.code.startsWith("auth/")) {
      return res.status(400).json({
        error: "Firebase error: " + error.message,
        code: "FIREBASE_ERROR",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        error: "Validation failed",
        details: error.message,
        code: "VALIDATION_ERROR",
      });
    }

    // Handle cast errors (invalid ID)
    if (error.name === "CastError") {
      return res.status(400).json({
        error: "Invalid user ID format",
        code: "INVALID_USER_ID",
      });
    }

    res.status(500).json({
      error: "Failed to update user role",
      details: error.message,
      code: "ROLE_UPDATE_ERROR",
    });
  }
};
