/**
 * Authentication Controllers
 * Extracted from routes for cleaner separation.
 */

import { getAuth } from "../config/firebase.js";
import { User } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import {
  sendSuccess,
  sendError,
  AppError,
} from "../middleware/errorHandler.js";


const VALID_BRANCHES = ["gil-puyat", "guadalupe"];
const VALID_ROLES = ["applicant", "tenant", "admin", "superAdmin"];

export const register = async (req, res, next) => {
  try {

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
    await auditLogger.logError(req, error, "Registration error");
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Check if this is just a check (for Google sign-in flow)
    const isCheckOnly = req.query.checkOnly === "true";

    // Find user in database using Firebase UID from verified token
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
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
    }

    // Block unverified non-admin users from logging in
    const isAdminRole = user.role === "admin" || user.role === "superAdmin";
    if (!user.isEmailVerified && !isAdminRole) {
      await auditLogger.logLogin(req, user, false, "Email not verified");
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    // Log successful login (not for checkOnly)
    if (!isCheckOnly) {
      await auditLogger.logLogin(req, user, true);
    }

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
    await auditLogger.logError(req, error, "Login error");
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // Get user info for audit logging
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      // User not in database but authenticated with Firebase - still log logout
      await auditLogger.logLogout(req, req.user.email);
      return res.json({
        message: "Logged out successfully",
        code: "LOGOUT_SUCCESS",
      });
    }

    // Log logout event for authenticated user with full details
    await auditLogger.logLogout(req, user);

    res.json({
      message: "Logged out successfully",
      code: "LOGOUT_SUCCESS",
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Logout error");
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

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
      // Extended profile fields
      gender: user.gender || "",
      address: user.address || "",
      city: user.city || "",
      dateOfBirth: user.dateOfBirth || null,
      emergencyContact: user.emergencyContact || "",
      emergencyPhone: user.emergencyPhone || "",
      studentId: user.studentId || "",
      school: user.school || "",
      yearLevel: user.yearLevel || "",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

/** Sanitize a name field — strip HTML/injection characters */
const sanitizeName = (s) => s?.trim().replace(/[<>"'&]/g, "") || "";

/** Sanitize a phone field — strip non-phone characters */
const sanitizePhone = (s) => s?.replace(/[^\d+\-() ]/g, "") || "";

/** Sanitize general text — strip dangerous characters */
const sanitizeText = (s) => s?.trim().replace(/[<>"'&]/g, "") || "";

export const updateProfile = async (req, res, next) => {
  try {
    // Sanitize input — core fields
    const firstName = req.body.firstName
      ? sanitizeName(req.body.firstName)
      : null;
    const lastName = req.body.lastName ? sanitizeName(req.body.lastName) : null;
    const phone = req.body.phone ? sanitizePhone(req.body.phone) : undefined;
    const profileImage =
      req.body.profileImage !== undefined ? req.body.profileImage : undefined;

    // Sanitize input — extended profile fields
    const gender = req.body.gender !== undefined ? req.body.gender : undefined;
    const address = req.body.address !== undefined ? sanitizeText(req.body.address) : undefined;
    const city = req.body.city !== undefined ? sanitizeText(req.body.city) : undefined;
    const dateOfBirth = req.body.dateOfBirth !== undefined ? req.body.dateOfBirth : undefined;
    const emergencyContact = req.body.emergencyContact !== undefined ? sanitizeText(req.body.emergencyContact) : undefined;
    const emergencyPhone = req.body.emergencyPhone !== undefined ? sanitizePhone(req.body.emergencyPhone) : undefined;
    const studentId = req.body.studentId !== undefined ? sanitizeText(req.body.studentId) : undefined;
    const school = req.body.school !== undefined ? sanitizeText(req.body.school) : undefined;
    const yearLevel = req.body.yearLevel !== undefined ? sanitizeText(req.body.yearLevel) : undefined;

    // Build update object with only provided fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined && phone !== null) updateData.phone = phone;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    // Extended fields
    if (gender !== undefined) updateData.gender = gender;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone;
    if (studentId !== undefined) updateData.studentId = studentId;
    if (school !== undefined) updateData.school = school;
    if (yearLevel !== undefined) updateData.yearLevel = yearLevel;

    // Check at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: "At least one field must be provided",
        code: "NO_UPDATE_DATA",
      });
    }

    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      updateData,
      { new: true, runValidators: true },
    );

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

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
        // Extended fields
        gender: user.gender || "",
        address: user.address || "",
        city: user.city || "",
        dateOfBirth: user.dateOfBirth || null,
        emergencyContact: user.emergencyContact || "",
        emergencyPhone: user.emergencyPhone || "",
        studentId: user.studentId || "",
        school: user.school || "",
        yearLevel: user.yearLevel || "",
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateBranch = async (req, res, next) => {
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
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

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
    next(error);
  }
};

export const setRole = async (req, res, next) => {
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

    res.json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ============================================================================
// PASSWORD RESET AUDIT LOGGING
// ============================================================================

/**
 * POST /api/auth/log-password-reset
 *
 * Public endpoint to log password reset attempts in the audit trail.
 * Called by the ForgotPassword frontend component.
 * No auth required since the user is not logged in at this point.
 */
export const logPasswordReset = async (req, res, next) => {
  try {
    const { email, success } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    await auditLogger.log({
      type: "login",
      action: success
        ? `Password reset email sent to ${email}`
        : `Password reset attempt failed for ${email}`,
      severity: success ? "info" : "warning",
      userId: null,
      userName: email,
      userRole: "unknown",
      userEmail: email,
      ipAddress:
        req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      metadata: {
        event: "password_reset_attempt",
        email,
        success,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ message: "Logged" });
  } catch (error) {
    console.error("❌ Failed to log password reset:", error);
    // Don't break the flow — just acknowledge
    res.json({ message: "Logged" });
  }
};
