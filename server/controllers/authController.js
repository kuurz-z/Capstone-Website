/**
 * Authentication Controllers
 * Extracted from routes for cleaner separation.
 */

import crypto from "crypto";
import { getDefaultPermissionsForRole } from "../config/accessControl.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { sendLoginOtpEmail } from "../config/email.js";
import { getAuth } from "../config/firebase.js";
import {
  AppError
} from "../middleware/errorHandler.js";
import logger from "../middleware/logger.js";
import {
  sanitizeName,
  sanitizePhone,
  sanitizeText,
} from "../middleware/validation.js";
import { LoginLog, User, UserSession } from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";


const VALID_BRANCHES = ROOM_BRANCHES;
const VALID_ROLES = ["applicant", "tenant", "branch_admin", "owner"];
const ADMIN_ROLES = ["branch_admin", "owner", "superadmin"];
const OTP_EXPIRES_MINUTES = 10;
const OTP_EXPIRES_MS = OTP_EXPIRES_MINUTES * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

const isAdminRole = (role) => ADMIN_ROLES.includes(role);

const getDeviceId = (req) =>
  typeof req.headers["x-device-id"] === "string"
    ? req.headers["x-device-id"].trim()
    : "";

const getSessionId = (req) =>
  typeof req.headers["x-session-id"] === "string"
    ? req.headers["x-session-id"].trim()
    : "";

const createOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(`${process.env.JWT_SECRET || "lilycrest"}:${otp}`).digest("hex");

const buildUserPayload = (user) => ({
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
  permissions: user.permissions,
  isActive: user.isActive,
  isEmailVerified: user.isEmailVerified,
  accountStatus: user.accountStatus,
});

const storeOtpChallenge = async (user, req, deviceId) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new AppError(
      "Unable to send OTP. Please contact support.",
      503,
      "OTP_EMAIL_SEND_FAILED",
    );
  }

  const otp = createOtp();
  const now = new Date();
  const pending = await UserSession.findOneAndUpdate(
    {
      userId: user._id,
      deviceId,
      isActive: false,
    },
    {
      $set: {
        deviceId,
        device: req.headers["x-device-name"] || "Unknown",
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
        otpHash: hashOtp(otp),
        otpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_MS),
        otpLastSentAt: now,
        otpAttempts: 0,
        otpVerifiedAt: null,
        expiresAt: null,
        logoutTime: now,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
  sendLoginOtpEmail({
    to: user.email,
    name,
    otp,
    expiresInMinutes: OTP_EXPIRES_MINUTES,
  }).then((emailResult) => {
    if (!emailResult?.success) {
      logger.error(
        { userId: String(user._id), email: user.email },
        "Failed to send login OTP email",
      );
    }
  }).catch((error) => {
    logger.error(
      { err: error, userId: String(user._id), email: user.email },
      "Failed to send login OTP email",
    );
  });

  return pending;
};

export const register = async (req, res, next) => {
  try {

    // Sanitize and validate input
    const data = req.sanitizedData;

    const { username, firstName, lastName, phone, branch, email } = data;

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
      tenantStatus: "applicant",
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
        user_id: user.user_id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        branch: user.branch,
        role: user.role,
        permissions: user.permissions,
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
      LoginLog.logEvent({ userId: user._id, email: user.email, action: "login_failed", success: false, failureReason: "Account inactive", req });
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
      // Note: tenantStatus is only set to meaningful values (active/inactive/etc)
      // when the user becomes a tenant via move-in. No sync needed here.
      await user.save();
    }

    // Block unverified non-admin users from logging in
    const adminUser = isAdminRole(user.role);
    if (!user.isEmailVerified && !adminUser) {
      await auditLogger.logLogin(req, user, false, "Email not verified");
      LoginLog.logEvent({ userId: user._id, email: user.email, action: "login_failed", success: false, failureReason: "Email not verified", req });
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    if (isCheckOnly) {
      return res.json({
        message: "User exists",
        user: buildUserPayload(user),
      });
    }

    let session = null;
    if (adminUser) {
      session = await UserSession.createSession(user._id, req, {
        deviceId: getDeviceId(req) || null,
        durationMs: SESSION_DURATION_MS,
        otpVerified: false,
      });
    } else {
      const deviceId = getDeviceId(req);
      if (!deviceId) {
        return res.status(400).json({
          error: "Device verification is required. Please try signing in again.",
          code: "DEVICE_ID_REQUIRED",
        });
      }

      const existingSession = await UserSession.findValidOtpSession(
        user._id,
        deviceId,
        getSessionId(req),
      );

      if (!existingSession) {
        await storeOtpChallenge(user, req, deviceId);
        return res.status(200).json({
          requiresOtp: true,
          message: "OTP verification required",
        });
      }

      existingSession.lastActivityAt = new Date();
      await existingSession.save();
      session = existingSession;
    }

    // Log successful login (not for checkOnly)
    if (!isCheckOnly) {
      await auditLogger.logLogin(req, user, true);
      LoginLog.logEvent({ userId: user._id, email: user.email, action: "login", success: true, req });
    }

    res.json({
      message: "Login successful",
      sessionId: session?.sessionId || null,
      user: buildUserPayload(user),
    });
  } catch (error) {
    await auditLogger.logError(req, error, "Login error");
    next(error);
  }
};

export const verifyLoginOtp = async (req, res, next) => {
  try {
    const { otp } = req.body || {};
    const deviceId = getDeviceId(req);

    if (!deviceId) {
      return res.status(400).json({
        error: "Device verification is required. Please sign in again.",
        code: "DEVICE_ID_REQUIRED",
      });
    }

    if (!/^\d{6}$/.test(String(otp || ""))) {
      return res.status(400).json({
        error: "Enter the 6-digit OTP code.",
        code: "INVALID_OTP_FORMAT",
      });
    }

    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({
        error: "User not found in database. Please register first.",
        code: "USER_NOT_FOUND",
      });
    }

    if (isAdminRole(user.role)) {
      const session = await UserSession.createSession(user._id, req, {
        deviceId,
        durationMs: SESSION_DURATION_MS,
        otpVerified: false,
      });
      return res.json({
        message: "Login successful",
        sessionId: session.sessionId,
        user: buildUserPayload(user),
      });
    }

    const pending = await UserSession.findPendingOtp(user._id, deviceId);
    if (!pending) {
      return res.status(400).json({
        error: "OTP expired. Please request a new code.",
        code: "OTP_EXPIRED",
      });
    }

    if (pending.otpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({
        error: "Too many invalid OTP attempts. Please request a new code.",
        code: "OTP_ATTEMPTS_EXCEEDED",
      });
    }

    if (pending.otpHash !== hashOtp(String(otp))) {
      pending.otpAttempts += 1;
      await pending.save();
      return res.status(400).json({
        error: "Invalid OTP code.",
        code: "OTP_INVALID",
      });
    }

    await UserSession.updateMany(
      { userId: user._id, deviceId, isActive: true },
      { $set: { isActive: false, logoutTime: new Date() } },
    );

    pending.otpHash = null;
    pending.otpExpiresAt = null;
    pending.otpAttempts = 0;
    await pending.save();

    const session = await UserSession.createSession(user._id, req, {
      deviceId,
      durationMs: SESSION_DURATION_MS,
      otpVerified: true,
    });

    await auditLogger.logLogin(req, user, true);
    LoginLog.logEvent({ userId: user._id, email: user.email, action: "login", success: true, req });

    return res.json({
      message: "OTP verified",
      sessionId: session.sessionId,
      user: buildUserPayload(user),
    });
  } catch (error) {
    await auditLogger.logError(req, error, "OTP verification error");
    next(error);
  }
};

export const resendLoginOtp = async (req, res, next) => {
  try {
    const deviceId = getDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({
        error: "Device verification is required. Please sign in again.",
        code: "DEVICE_ID_REQUIRED",
      });
    }

    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({
        error: "User not found in database. Please register first.",
        code: "USER_NOT_FOUND",
      });
    }

    if (isAdminRole(user.role)) {
      return res.json({ message: "OTP is not required for this account." });
    }

    const pending = await UserSession.findOne({
      userId: user._id,
      deviceId,
      isActive: false,
      otpHash: { $ne: null },
    }).select("+otpHash");

    if (pending?.otpLastSentAt) {
      const elapsed = Date.now() - pending.otpLastSentAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${retryAfterSeconds}s before requesting another OTP.`,
          code: "OTP_RESEND_COOLDOWN",
          retryAfterSeconds,
        });
      }
    }

    await storeOtpChallenge(user, req, deviceId);
    return res.json({
      message: "OTP sent. Please check your email.",
      cooldownSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    await auditLogger.logError(req, error, "OTP resend error");
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
    const sessionId = getSessionId(req);
    if (sessionId) {
      await UserSession.updateOne(
        { userId: user._id, sessionId, isActive: true },
        { $set: { isActive: false, logoutTime: new Date() } },
      );
    }

    await auditLogger.logLogout(req, user);
    LoginLog.logEvent({ userId: user._id, email: user.email, action: "logout", success: true, req });

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
      user_id: user.user_id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      profileImage: user.profileImage,
      branch: user.branch,
      role: user.role,
      permissions: user.permissions,
      tenantStatus: user.tenantStatus,
      accountStatus: user.accountStatus,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      // Extended profile fields
      gender: user.gender || "",
      civilStatus: user.civilStatus || "",
      nationality: user.nationality || "",
      occupation: user.occupation || "",
      address: user.address || "",
      city: user.city || "",
      province: user.province || "",
      zipCode: user.zipCode || "",
      dateOfBirth: user.dateOfBirth || null,
      emergencyContact: user.emergencyContact || "",
      emergencyPhone: user.emergencyPhone || "",
      emergencyRelationship: user.emergencyRelationship || "",
      // Legacy fields
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

    // S5: Validate profileImage size and MIME type if provided
    // Only validate base64 data URLs — skip for already-uploaded external URLs (e.g. ImageKit)
    if (profileImage && typeof profileImage === "string" && profileImage.length > 0) {
      const isDataUrl = profileImage.startsWith("data:");
      if (isDataUrl) {
        const dataUrlMatch = profileImage.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,/);
        if (!dataUrlMatch) {
          return res.status(400).json({
            error: "Profile image must be a valid base64-encoded image (JPEG, PNG, GIF, or WebP).",
            code: "INVALID_IMAGE_FORMAT",
          });
        }
        const base64Data = profileImage.substring(dataUrlMatch[0].length);
        const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded
        const estimatedBytes = Math.ceil(base64Data.length * 3 / 4);
        if (estimatedBytes > MAX_IMAGE_BYTES) {
          return res.status(400).json({
            error: "Profile image is too large. Maximum size is 5 MB.",
            code: "IMAGE_TOO_LARGE",
          });
        }
      }
      // External URLs (https://...) pass through without validation
    }

    // Sanitize input — extended profile fields
    const gender = req.body.gender !== undefined ? req.body.gender : undefined;
    const civilStatus = req.body.civilStatus !== undefined ? req.body.civilStatus : undefined;
    const nationality = req.body.nationality !== undefined ? sanitizeText(req.body.nationality) : undefined;
    const occupation = req.body.occupation !== undefined ? sanitizeText(req.body.occupation) : undefined;
    const address = req.body.address !== undefined ? sanitizeText(req.body.address) : undefined;
    const city = req.body.city !== undefined ? sanitizeText(req.body.city) : undefined;
    const province = req.body.province !== undefined ? sanitizeText(req.body.province) : undefined;
    const zipCode = req.body.zipCode !== undefined ? sanitizeText(req.body.zipCode) : undefined;
    const dateOfBirth = req.body.dateOfBirth !== undefined ? req.body.dateOfBirth : undefined;
    const emergencyContact = req.body.emergencyContact !== undefined ? sanitizeText(req.body.emergencyContact) : undefined;
    const emergencyPhone = req.body.emergencyPhone !== undefined ? sanitizePhone(req.body.emergencyPhone) : undefined;
    const emergencyRelationship = req.body.emergencyRelationship !== undefined ? sanitizeText(req.body.emergencyRelationship) : undefined;
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
    if (civilStatus !== undefined) updateData.civilStatus = civilStatus;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (province !== undefined) updateData.province = province;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone;
    if (emergencyRelationship !== undefined) updateData.emergencyRelationship = emergencyRelationship;
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
        user_id: user.user_id,
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
        civilStatus: user.civilStatus || "",
        nationality: user.nationality || "",
        occupation: user.occupation || "",
        address: user.address || "",
        city: user.city || "",
        province: user.province || "",
        zipCode: user.zipCode || "",
        dateOfBirth: user.dateOfBirth || null,
        emergencyContact: user.emergencyContact || "",
        emergencyPhone: user.emergencyPhone || "",
        emergencyRelationship: user.emergencyRelationship || "",
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
    if (role === "branch_admin") {
      claims.branch_admin = true;
    } else if (role === "owner") {
      claims.owner = true;
      claims.branch_admin = true; // Owners also have branch_admin privileges
    }

    // Find user by MongoDB _id
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Set custom claims in Firebase Auth so the frontend can recognize
    // branch admins and owners from the token itself.
    const auth = getAuth();

    if (!auth) {
      return res.status(503).json({
        error:
          "Authentication is temporarily unavailable. Firebase Admin is not initialized.",
        code: "FIREBASE_ADMIN_NOT_INITIALIZED",
      });
    }

    // Persist to MongoDB first — if this fails we never touch Firebase,
    // so the two stores stay in sync.
    const previousRole = user.role;
    const previousPermissions = [...(user.permissions || [])];
    user.role = role;
    user.permissions =
      role === "branch_admin" || role === "owner"
        ? getDefaultPermissionsForRole(role)
        : [];
    await user.save();

    // Propagate to Firebase claims.  On failure, roll back MongoDB so the
    // stores don't diverge.
    try {
      await auth.setCustomUserClaims(user.firebaseUid, claims);
    } catch (firebaseErr) {
      user.role = previousRole;
      user.permissions = previousPermissions;
      await user.save();
      throw firebaseErr;
    }

    res.json({
      message: "User role updated successfully",
      user: {
        id: user._id,
        user_id: user.user_id,
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
    logger.error({ err: error, requestId: req.id }, "Failed to log password reset");
    // Don't break the flow — just acknowledge
    res.json({ message: "Logged" });
  }
};
