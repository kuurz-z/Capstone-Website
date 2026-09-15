/**
 * Authentication Controllers
 * Extracted from routes for cleaner separation.
 */

import crypto from "crypto";
import { getDefaultPermissionsForRole } from "../config/accessControl.js";
import { ROOM_BRANCHES } from "../config/branches.js";
import { isAdminRole, isOwnerRole, OWNER_ROLE_VALUES } from "../config/roles.js";
import {
  SESSION_ASSURANCE_METHODS,
  isSessionAuthorizedForRole,
} from "../config/sessionAssurance.js";
import { sendLoginOtpEmail, sendPasswordChangedEmail } from "../config/email.js";
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
import { normalizeAddress } from "../utils/addressUtils.js";
import {
  LoginLog,
  Reservation,
  Stay,
  User,
  UserSession,
} from "../models/index.js";
import auditLogger from "../utils/auditLogger.js";
import { invalidateUserSessions } from "../services/sessionInvalidationService.js";
import {
  claimFirstVerifiedLoginSession,
  cleanupFailedFirstVerifiedLoginSession,
} from "../services/firstVerifiedLoginService.js";
import {
  resolveTenantOccupancyDetails,
  resolveTenantPersonalDetails,
} from "../services/tenantProfileService.js";
import {
  clearWebSessionCookie,
  getWebSessionId,
  setWebSessionCookie,
} from "../utils/webSessionCookie.js";


const VALID_BRANCHES = ROOM_BRANCHES;
const VALID_ROLES = ["applicant", "tenant", "branch_admin", "owner"];
const OTP_EXPIRES_MINUTES = 10;
const OTP_EXPIRES_MS = OTP_EXPIRES_MINUTES * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

const getDeviceId = (req) =>
  typeof req.headers["x-device-id"] === "string"
    ? req.headers["x-device-id"].trim()
    : "";

const getSessionId = (req) => getWebSessionId(req);

const createOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(`${process.env.JWT_SECRET || "lilycrest"}:${otp}`).digest("hex");

const otpMatches = (storedHash, submittedHash) =>
  typeof storedHash === "string" &&
  /^[a-f0-9]{64}$/i.test(storedHash) &&
  crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(submittedHash, "hex"));

const fingerprint = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 12);

const OTP_EMAIL_FAILURE_MESSAGE =
  "We could not send the verification code. Please try again later.";

const sendIdentityConflict = async (req, res, user) => {
  const event = {
    requestId: req.id,
    attemptedUidFingerprint: fingerprint(req.user?.uid),
    userRecordFingerprint: fingerprint(user._id),
    eventType: "AUTH_IDENTITY_CONFLICT",
    timestamp: new Date().toISOString(),
  };
  logger.warn(event, "Authentication identity conflict blocked");
  await auditLogger.log({
    req,
    type: "error",
    action: "Authentication identity conflict blocked",
    severity: "critical",
    entityType: "user",
    entityId: user._id,
    details: "A verified Firebase identity matched an email owned by a different UID; no account data was changed.",
    metadata: event,
  });
  return res.status(409).json({
    success: false,
    error: {
      code: "IDENTITY_CONFLICT",
      message: "This account requires identity verification before it can be linked.",
    },
    meta: { requestId: req.id, timestamp: new Date().toISOString() },
  });
};

const buildUserPayload = (user) => ({
  id: user._id,
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  branch: user.branch,
  role: isOwnerRole(user.role) ? "owner" : user.role,
  permissions: user.permissions,
  isActive: user.isActive,
  isEmailVerified: user.isEmailVerified,
  accountStatus: user.accountStatus,
  createdAt: user.createdAt,
});

export const buildRegistrationUserPayload = (user, options = {}) => ({
  id: user._id,
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  branch: user.branch,
  role: user.role,
  permissions: user.permissions || [],
  isEmailVerified: Boolean(user.isEmailVerified),
  onboardingStatus: user.onboardingStatus || "profile_complete",
  createdAt: user.createdAt,
  isNewAccount: options.isNewAccount !== undefined ? options.isNewAccount : true,
});

export const storeOtpChallenge = async (user, req, deviceId) => {
  const otp = createOtp();
  const now = new Date();
  const otpPurpose = "login";
  const challengeKey = crypto
    .createHash("sha256")
    .update(`${String(user._id)}:${deviceId}:${otpPurpose}`)
    .digest("hex");
  const logContext = {
    event: "login_otp_delivery",
    environment: process.env.NODE_ENV || "development",
    operation: "login_otp",
    requestId: req.id,
    userFingerprint: fingerprint(user._id),
    emailFingerprint: fingerprint(String(user.email || "").trim().toLowerCase()),
    deviceFingerprint: fingerprint(deviceId),
  };

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username;
  let emailResult;
  try {
    emailResult = await sendLoginOtpEmail({
      to: user.email,
      name,
      otp,
      expiresInMinutes: OTP_EXPIRES_MINUTES,
    });
  } catch (_) {
    emailResult = {
      success: false,
      category: "unknown",
      statusCode: null,
    };
  }

  if (!emailResult?.success) {
    logger.error({
      ...logContext,
      provider: "resend",
      classification: emailResult?.category || "unknown",
      httpStatus: emailResult?.statusCode || null,
      success: false,
    }, "Login OTP delivery failed");

    throw new AppError(
      OTP_EMAIL_FAILURE_MESSAGE,
      503,
      "OTP_EMAIL_SEND_FAILED",
    );
  }

  // The provider must accept the message before the code becomes verifiable.
  // This preserves an existing valid challenge when a resend attempt fails.
  const challengeUpdate = {
    $set: {
      userId: user._id,
      deviceId,
      device: req.headers["x-device-name"] || "Unknown",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      otpHash: hashOtp(otp),
      otpExpiresAt: new Date(now.getTime() + OTP_EXPIRES_MS),
      otpLastSentAt: now,
      otpAttempts: 0,
      otpVerifiedAt: null,
      otpPurpose,
      challengeKey,
      isActive: false,
      expiresAt: null,
      logoutTime: now,
    },
  };

  let pending;
  try {
    pending = await UserSession.findOneAndUpdate(
      { challengeKey },
      challengeUpdate,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Concurrent first sends can race on the unique scope key. Once the winner
    // inserts, the other request safely supersedes that same single row.
    if (error?.code !== 11000) throw error;
    pending = await UserSession.findOneAndUpdate(
      { challengeKey },
      challengeUpdate,
      { new: true },
    );
    if (!pending) throw error;
  }

  // Defensive cleanup for legacy duplicates or concurrent first-time upserts.
  // Verification only ever sees the accepted challenge retained above.
  await UserSession.updateMany(
    {
      _id: { $ne: pending._id },
      userId: user._id,
      deviceId,
      isActive: false,
      otpHash: { $ne: null },
      otpPurpose: { $in: [otpPurpose, null] },
      otpLastSentAt: { $lte: now },
    },
    {
      $set: {
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
      },
    },
  );

  logger.info(
    {
      ...logContext,
      success: true,
    },
    "Login OTP delivery accepted and challenge stored",
  );

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
      return res.status(200).json({
        message: "User onboarding already exists",
        code: "ONBOARDING_RESUMED",
        user: buildRegistrationUserPayload(existingUser, { isNewAccount: false }),
      });
    }

    const normalizedEmail = String(req.user.email || "").toLowerCase().trim();
    const emailOwner = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;
    if (emailOwner) return sendIdentityConflict(req, res, emailOwner);

    // Auto-resolve username collision if username is already taken
    let finalUsername = username;
    const usernameExists = await User.findOne({ username: finalUsername });
    if (usernameExists) {
      let suffix = 2;
      while (await User.exists({ username: `${username}${suffix}` })) {
        suffix += 1;
      }
      finalUsername = `${username}${suffix}`;
    }

    // Save user data to MongoDB
    // NOTE: Firebase Auth is the source of truth for email verification
    // We sync the verification status from Firebase (req.user.email_verified)
    const user = new User({
      firebaseUid: req.user.uid,
      email: req.user.email,
      username: finalUsername,
      firstName,
      lastName,
      phone,
      branch,
      role: "applicant",
      isEmailVerified: req.user.email_verified || false, // Synced from Firebase
      tenantStatus: "applicant",
      onboardingStatus: req.user.email_verified ? "profile_complete" : "verification_pending",
      initialEmailVerifiedLoginEligibleAt:
        req.user.firebase?.sign_in_provider === "password" ? new Date() : null,
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
      user: buildRegistrationUserPayload(user, { isNewAccount: true }),
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existingByUid = await User.findOne({ firebaseUid: req.user.uid });
      if (existingByUid) {
        return res.status(200).json({
          message: "User onboarding already exists",
          code: "ONBOARDING_RESUMED",
          user: buildRegistrationUserPayload(existingByUid, { isNewAccount: false }),
        });
      }
      const existingByEmail = req.user.email
        ? await User.findOne({ email: req.user.email.toLowerCase().trim() })
        : null;
      if (existingByEmail) return sendIdentityConflict(req, res, existingByEmail);
      if (error?.keyPattern?.username || error?.keyValue?.username) {
        return res.status(400).json({
          error: "A generated username collision occurred. Please retry registration.",
          code: "USERNAME_TAKEN",
        });
      }
      return res.status(409).json({
        success: false,
        error: {
          code: "REGISTRATION_CONFLICT",
          message: "Registration could not be completed because the profile already exists.",
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    }
    await auditLogger.logError(req, error, "Registration error");
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    // Check if this is just a check (for Google sign-in flow)
    const isCheckOnly = req.query.checkOnly === "true";

    // Find user in database using Firebase UID from verified token
    let user = await User.findOne({ firebaseUid: req.user.uid });

    if (!user && req.user.email) {
      // Email equality is not proof that two Firebase identities belong to the
      // same person. Provider linking is disabled at this boundary. A future
      // linking service must require recent reauthentication and preserve UID.
      const byEmail = await User.findOne({
        email: req.user.email.toLowerCase().trim(),
      });

      if (byEmail) {
        return sendIdentityConflict(req, res, byEmail);
      } else {
        logger.info(
          { uidFingerprint: fingerprint(req.user.uid) },
          "Login: user not found by UID or email",
        );
      }
    }

    if (!user) {
      // Only log if this is a real login attempt, not a check
      if (!isCheckOnly) {
        await auditLogger.logLogin(
          req,
          req.user.email || "unknown",
          false,
          "Account not found - Registration required",
        );
      }
      return res.status(404).json({
        error: "User not found in database. Please register first.",
        code: "USER_NOT_FOUND",
      });
    }

    const firebaseEmail = String(req.user.email || "").toLowerCase().trim();
    const mongoEmail = String(user.email || "").toLowerCase().trim();
    if (!firebaseEmail || firebaseEmail !== mongoEmail) {
      return sendIdentityConflict(req, res, user);
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
    if (
      user.isEmailVerified !== firebaseEmailVerified ||
      (firebaseEmailVerified && user.onboardingStatus === "verification_pending")
    ) {
      user.isEmailVerified = firebaseEmailVerified;
      if (firebaseEmailVerified && user.onboardingStatus === "verification_pending") {
        user.onboardingStatus = "profile_complete";
      }
      // Note: tenantStatus is only set to meaningful values (active/inactive/etc)
      // when the user becomes a tenant via move-in. No sync needed here.
      await user.save();
    }

    if (isCheckOnly) {
      return res.json({
        message: "User exists",
        user: buildUserPayload(user),
      });
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

    const signInProvider = req.user.firebase?.sign_in_provider;
    const isOAuthUser = Boolean(signInProvider && signInProvider !== "password");

    const deviceId = getDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({
        error: "Device verification is required. Please try signing in again.",
        code: "DEVICE_ID_REQUIRED",
      });
    }

    let session = null;
    if (adminUser || isOAuthUser) {
      // Admins and OAuth users (Google, Facebook, etc.) skip OTP. Their
      // sessions record the truthful assurance method instead of fabricating
      // an OTP verification timestamp.
      session = await UserSession.createSession(user._id, req, {
        deviceId,
        durationMs: SESSION_DURATION_MS,
        otpVerified: false,
        assuranceMethod: adminUser
          ? (isOAuthUser
              ? SESSION_ASSURANCE_METHODS.OAUTH
              : SESSION_ASSURANCE_METHODS.ADMIN_PASSWORD)
          : SESSION_ASSURANCE_METHODS.OAUTH,
        securityVersion: user.securityVersion,
      });
    } else {
      const existingSession = await UserSession.findValidSession(
        user._id,
        deviceId,
        getSessionId(req),
      );

      if (
        isSessionAuthorizedForRole(existingSession, user.role) &&
        Number(existingSession.securityVersion || 0) ===
          Number(user.securityVersion || 0)
      ) {
        existingSession.lastActivityAt = new Date();
        await existingSession.save();
        session = existingSession;
      } else {
        if (user.role === "applicant") {
          const exemption = await claimFirstVerifiedLoginSession({
            userId: user._id,
            firebaseUid: req.user.uid,
            email: firebaseEmail,
            expectedSecurityVersion: Number(user.securityVersion || 0),
            req,
            deviceId,
            durationMs: SESSION_DURATION_MS,
          });

          if (exemption.claimed) {
            try {
              if (!setWebSessionCookie(res, exemption.session.sessionId)) {
                throw new Error("Application session cookie could not be created");
              }
            } catch (cookieError) {
              clearWebSessionCookie(res);
              await cleanupFailedFirstVerifiedLoginSession({
                userId: user._id,
                sessionId: exemption.session.sessionId,
                deviceId: exemption.session.deviceId,
                loginTime: exemption.session.loginTime,
              });
              throw cookieError;
            }

            user = exemption.user;
            await auditLogger.logLogin(req, user, true);
            LoginLog.logEvent({ userId: user._id, email: user.email, action: "login", success: true, req });
            return res.json({
              message: "Login successful",
              user: buildUserPayload(user),
              sessionId: exemption.session.sessionId,
            });
          }
        }

        clearWebSessionCookie(res);
        await storeOtpChallenge(user, req, deviceId);
        return res.status(200).json({
          requiresOtp: true,
          code: "OTP_REQUIRED",
          message: "OTP verification required",
        });
      }
    }

    // Log successful login (not for checkOnly)
    if (!isCheckOnly) {
      await auditLogger.logLogin(req, user, true);
      LoginLog.logEvent({ userId: user._id, email: user.email, action: "login", success: true, req });
    }

    setWebSessionCookie(res, session?.sessionId);
    res.json({
      message: "Login successful",
      user: buildUserPayload(user),
      sessionId: session?.sessionId,
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
      return res.status(400).json({
        error: "OTP verification is not required for this account.",
        code: "OTP_NOT_REQUIRED",
      });
    }

    const pending = await UserSession.findPendingOtp(user._id, deviceId, "login");
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

    const submittedOtpHash = hashOtp(String(otp));
    if (!otpMatches(pending.otpHash, submittedOtpHash)) {
      await UserSession.updateOne(
        {
          _id: pending._id,
          isActive: false,
          otpHash: { $ne: null },
          otpExpiresAt: { $gt: new Date() },
          otpAttempts: { $lt: OTP_MAX_ATTEMPTS },
        },
        { $inc: { otpAttempts: 1 } },
      );
      return res.status(400).json({
        error: "Invalid OTP code.",
        code: "OTP_INVALID",
      });
    }

    const consumed = await UserSession.findOneAndUpdate(
      {
        _id: pending._id,
        userId: user._id,
        deviceId,
        isActive: false,
        otpHash: submittedOtpHash,
        otpExpiresAt: { $gt: new Date() },
        otpAttempts: { $lt: OTP_MAX_ATTEMPTS },
      },
      {
        $set: {
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpVerifiedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!consumed) {
      return res.status(400).json({
        error: "OTP expired or already used. Please request a new code.",
        code: "OTP_EXPIRED",
      });
    }

    await UserSession.updateMany(
      { userId: user._id, deviceId, isActive: true },
      { $set: { isActive: false, logoutTime: new Date() } },
    );

    const session = await UserSession.createSession(user._id, req, {
      deviceId,
      durationMs: SESSION_DURATION_MS,
      otpVerified: true,
      assuranceMethod: SESSION_ASSURANCE_METHODS.LOGIN_OTP,
      securityVersion: user.securityVersion,
    });

    await auditLogger.logLogin(req, user, true);
    LoginLog.logEvent({ userId: user._id, email: user.email, action: "login", success: true, req });

    setWebSessionCookie(res, session.sessionId);
    return res.json({
      message: "OTP verified",
      user: buildUserPayload(user),
      sessionId: session.sessionId,
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
      otpPurpose: { $in: ["login", null] },
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
    clearWebSessionCookie(res);
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

    const reservation = await Reservation.findOne({
      userId: user._id,
      isArchived: { $ne: true },
      status:
        user.role === "tenant"
          ? { $in: ["moveIn", "moveOut"] }
          : { $nin: ["cancelled", "rejected", "archived"] },
    })
      .sort({ applicationSubmittedAt: -1, updatedAt: -1 })
      .populate("roomId", "name roomNumber branch")
      .lean();
    const currentStay = reservation
      ? await Stay.findOne({
          reservationId: reservation._id,
          status: { $in: ["active", "ending_soon", "renewed"] },
        })
          .sort({ leaseStartDate: -1 })
          .lean()
      : null;
    const personalInformation = resolveTenantPersonalDetails({
      user,
      reservation: reservation || {},
    });
    const occupancy = resolveTenantOccupancyDetails({
      reservation: reservation || {},
      currentStay,
    });

    res.json({
      id: user._id,
      user_id: user.user_id,
      email: user.email,
      username: user.username,
      firstName: personalInformation.firstName || user.firstName,
      middleName: personalInformation.middleName || user.middleName || "",
      lastName: personalInformation.lastName || user.lastName,
      phone: personalInformation.phone || user.phone || "",
      profileImage: personalInformation.profileImage || user.profileImage || "",
      branch: occupancy.branch || user.branch,
      role: user.role,
      permissions: user.permissions,
      tenantStatus: user.tenantStatus,
      accountStatus: user.accountStatus,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      // Extended profile fields
      gender: personalInformation.gender || user.gender || "",
      civilStatus: personalInformation.civilStatus || user.civilStatus || "",
      nationality: personalInformation.nationality || user.nationality || "",
      occupation: personalInformation.occupation || user.occupation || "",
      educationLevel: personalInformation.educationLevel || user.educationLevel || "",
      address: personalInformation.currentAddress || user.address || "",
      city: personalInformation.city || user.city || "",
      province: personalInformation.province || user.province || "",
      zipCode: user.zipCode || "",
      dateOfBirth: personalInformation.birthDate || user.dateOfBirth || null,
      emergencyContact: personalInformation.emergencyContact.name || user.emergencyContact || "",
      emergencyPhone: personalInformation.emergencyContact.phone || user.emergencyPhone || "",
      emergencyRelationship:
        personalInformation.emergencyContact.relationship || user.emergencyRelationship || "",
      personalInformation,
      emergencyContactDetails: personalInformation.emergencyContact,
      occupancy,
      lease: {
        startDate: currentStay?.leaseStartDate || occupancy.moveInDate,
        endDate: currentStay?.leaseEndDate || null,
        status: currentStay?.status || null,
      },
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



export const TENANT_APPLICATION_LOCKED_PROFILE_FIELDS = Object.freeze([
  "firstName",
  "middleName",
  "lastName",
  "dateOfBirth",
  "gender",
  "civilStatus",
  "nationality",
  "occupation",
  "educationLevel",
  "address",
  "city",
  "province",
  "zipCode",
  "emergencyContact",
  "emergencyPhone",
  "emergencyRelationship",
]);

export const findLockedTenantProfileFields = (body = {}, isLocked = false) => {
  if (!isLocked) return [];
  const fields = [];
  for (const field of TENANT_APPLICATION_LOCKED_PROFILE_FIELDS) {
    if (body[field] !== undefined) {
      fields.push(field);
    }
  }
  return fields;
};

export const updateProfile = async (req, res, next) => {
  try {
    const profileOwner = await User.findOne({ firebaseUid: req.user.uid })
      .select(
        "_id role tenantStatus firstName middleName lastName dateOfBirth gender civilStatus nationality occupation educationLevel address city province zipCode emergencyContact emergencyPhone emergencyRelationship",
      )
      .lean();
    if (!profileOwner) {
      return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    }

    // Check if user has an active submitted application or tenant lease
    let isLocked =
      profileOwner.role === "tenant" ||
      ["active", "moved_in", "moved_out", "checked_in"].includes(
        String(profileOwner.tenantStatus || "").toLowerCase(),
      );

    if (!isLocked) {
      const submittedReservation = await Reservation.exists({
        userId: profileOwner._id,
        isArchived: { $ne: true },
        status: { $nin: ["cancelled", "rejected"] },
        $or: [
          { applicationSubmittedAt: { $ne: null } },
          {
            status: {
              $in: [
                "pending_application_review",
                "approved_for_payment",
                "payment_pending",
                "reserved",
                "moveIn",
                "moveOut",
              ],
            },
          },
        ],
      });
      isLocked = Boolean(submittedReservation);
    }

    if (isLocked) {
      const lockedFields = findLockedTenantProfileFields(req.body, true).filter((field) => {
        const reqVal = req.body[field];
        const curVal = profileOwner[field];
        if (reqVal === undefined || reqVal === null) return false;
        if (curVal instanceof Date && reqVal) {
          return (
            new Date(curVal).toISOString().slice(0, 10) !==
            new Date(reqVal).toISOString().slice(0, 10)
          );
        }
        return String(reqVal).trim() !== String(curVal || "").trim();
      });

      if (lockedFields.length > 0) {
        return res.status(403).json({
          error:
            "Application-derived profile details cannot be edited while an application or lease is active. Please contact administration to request a correction.",
          code: "TENANT_APPLICATION_PROFILE_FIELDS_READ_ONLY",
          details: { lockedFields },
        });
      }
    }
    // Sanitize input — core fields
    const source = req.sanitizedData || req.body || {};
    const firstName = source.firstName !== undefined
      ? (req.sanitizedData?.firstName || sanitizeName(req.body.firstName))
      : null;
    const middleName = source.middleName !== undefined
      ? (req.sanitizedData?.middleName !== undefined ? req.sanitizedData.middleName : sanitizeName(req.body.middleName))
      : undefined;
    const lastName = source.lastName !== undefined
      ? (req.sanitizedData?.lastName || sanitizeName(req.body.lastName))
      : null;
    const phone = source.phone !== undefined
      ? (req.sanitizedData?.phone !== undefined ? req.sanitizedData.phone : sanitizePhone(req.body.phone))
      : undefined;
    const profileImage =
      req.body.profileImage !== undefined ? req.body.profileImage : undefined;

    // S5: Validate profileImage size and MIME type if provided
    // Only validate base64 data URLs — skip already-uploaded external URLs.
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
    const gender = source.gender !== undefined ? source.gender : undefined;
    const civilStatus = source.civilStatus !== undefined ? source.civilStatus : undefined;
    const nationality = source.nationality !== undefined ? (req.sanitizedData?.nationality !== undefined ? req.sanitizedData.nationality : sanitizeText(req.body.nationality)) : undefined;
    const occupation = source.occupation !== undefined ? (req.sanitizedData?.occupation !== undefined ? req.sanitizedData.occupation : sanitizeText(req.body.occupation)) : undefined;
    const educationLevel = source.educationLevel !== undefined ? (req.sanitizedData?.educationLevel !== undefined ? req.sanitizedData.educationLevel : sanitizeText(req.body.educationLevel)) : undefined;
    const sanitizedAddress = source.address !== undefined ? (req.sanitizedData?.address !== undefined ? req.sanitizedData.address : sanitizeText(req.body.address)) : undefined;
    // Normalize after XSS sanitization (safety first, formatting second).
    const address = typeof sanitizedAddress === "string" ? normalizeAddress(sanitizedAddress).value : sanitizedAddress;
    const city = source.city !== undefined ? (req.sanitizedData?.city !== undefined ? req.sanitizedData.city : sanitizeText(req.body.city)) : undefined;
    const province = source.province !== undefined ? (req.sanitizedData?.province !== undefined ? req.sanitizedData.province : sanitizeText(req.body.province)) : undefined;
    const zipCode = source.zipCode !== undefined ? (req.sanitizedData?.zipCode !== undefined ? req.sanitizedData.zipCode : sanitizeText(req.body.zipCode)) : undefined;
    const dateOfBirth = source.dateOfBirth !== undefined ? source.dateOfBirth : undefined;
    const emergencyContact = source.emergencyContact !== undefined ? (req.sanitizedData?.emergencyContact !== undefined ? req.sanitizedData.emergencyContact : sanitizeText(req.body.emergencyContact)) : undefined;
    const emergencyPhone = source.emergencyPhone !== undefined ? (req.sanitizedData?.emergencyPhone !== undefined ? req.sanitizedData.emergencyPhone : sanitizePhone(req.body.emergencyPhone)) : undefined;
    const emergencyRelationship = source.emergencyRelationship !== undefined ? (req.sanitizedData?.emergencyRelationship !== undefined ? req.sanitizedData.emergencyRelationship : sanitizeText(req.body.emergencyRelationship)) : undefined;
    const studentId = source.studentId !== undefined ? (req.sanitizedData?.studentId !== undefined ? req.sanitizedData.studentId : sanitizeText(req.body.studentId)) : undefined;
    const school = source.school !== undefined ? (req.sanitizedData?.school !== undefined ? req.sanitizedData.school : sanitizeText(req.body.school)) : undefined;
    const yearLevel = source.yearLevel !== undefined ? (req.sanitizedData?.yearLevel !== undefined ? req.sanitizedData.yearLevel : sanitizeText(req.body.yearLevel)) : undefined;

    // Build update object with only provided fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (middleName !== undefined) updateData.middleName = middleName || "";
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined && phone !== null) updateData.phone = phone;
    // Mirror the photo into the field the mobile app reads/writes
    // (`picture`) so a photo set on web shows up on mobile too.
    if (profileImage !== undefined) {
      updateData.profileImage = profileImage;
      updateData.picture = profileImage;
    }
    // Extended fields
    if (gender !== undefined) updateData.gender = gender;
    if (civilStatus !== undefined) updateData.civilStatus = civilStatus;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (educationLevel !== undefined) updateData.educationLevel = educationLevel;
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
        middleName: user.middleName || "",
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
        educationLevel: user.educationLevel || "",
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

    const existingUser = await User.findOne({ firebaseUid: req.user.uid });
    if (!existingUser) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (isAdminRole(existingUser.role)) {
      return res.status(403).json({
        error: "Branch assignment for admin accounts must be managed by the owner.",
        code: "ADMIN_BRANCH_SELF_SERVICE_DENIED",
      });
    }

    // Update applicant/tenant branch selection.
    let invalidation = null;
    if (existingUser.branch !== branch) invalidation = await invalidateUserSessions({ user: existingUser, reason: "branch_reassigned", req });
    existingUser.branch = branch;
    const user = await existingUser.save();
    if (!user) {
      return res.status(404).json({
        error: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    res.json({
      message: "Branch updated successfully",
      sessionCleanupComplete: !invalidation?.failures?.length,
      user: {
        id: user._id,
        user_id: user.user_id,
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
    const nextPermissions = role === "branch_admin" || role === "owner"
      ? getDefaultPermissionsForRole(role)
      : [];
    if (previousRole === role && JSON.stringify(previousPermissions) === JSON.stringify(nextPermissions)) {
      return res.json({ message: "User role unchanged", user: { id: user._id, user_id: user.user_id, email: user.email, role: user.role }, sessionCleanupComplete: true });
    }
    const invalidation = await invalidateUserSessions({ user, reason: "role_changed", req });
    user.role = role;
    user.permissions = nextPermissions;
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
      sessionCleanupComplete: !invalidation.failures.length,
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

const PASSWORD_RESET_COOLDOWN_MS = 30 * 1000;
const passwordResetHistory = new Map();

const cleanupPasswordResetHistory = () => {
  const cutoff = Date.now() - PASSWORD_RESET_COOLDOWN_MS;
  for (const [key, timestamp] of passwordResetHistory.entries()) {
    if (timestamp < cutoff) {
      passwordResetHistory.delete(key);
    }
  }
};

/**
 * POST /api/auth/log-password-reset
 *
 * Public endpoint to check cooldown and log password reset attempts in the audit trail.
 * Called by the ForgotPassword frontend component.
 * No auth required since the user is not logged in at this point.
 */
export const logPasswordReset = async (req, res, next) => {
  try {
    const { email, success, checkOnly } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const lastSentAt = passwordResetHistory.get(normalizedEmail);

    if (lastSentAt) {
      const elapsed = now - lastSentAt;
      if (elapsed < PASSWORD_RESET_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((PASSWORD_RESET_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${retryAfterSeconds}s before requesting another reset email.`,
          code: "PASSWORD_RESET_COOLDOWN",
          retryAfterSeconds,
        });
      }
    }

    if (checkOnly) {
      return res.json({ message: "Cooldown check passed", cooldownSeconds: 30, retryAfterSeconds: 30 });
    }

    if (success !== false) {
      passwordResetHistory.set(normalizedEmail, now);
      cleanupPasswordResetHistory();
      User.updateOne({ email: normalizedEmail }, { $set: { lastPasswordResetAt: new Date(now) } }).catch(() => {});
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

    res.json({ message: "Logged", cooldownSeconds: 30, retryAfterSeconds: 30 });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, "Failed to log password reset");
    // Don't break the flow — just acknowledge
    res.json({ message: "Logged" });
  }
};

/**
 * POST /api/auth/notify-password-changed
 *
 * Authenticated endpoint called after the user successfully updates their password.
 * Dispatches security notification email, optionally invalidates other active sessions,
 * and logs a security audit trail entry.
 *
 * @requires Firebase token in Authorization header
 * @body { revokeOtherSessions?: boolean }
 * @returns { success: true, message: string, sessionCleanupComplete: boolean }
 */
export const notifyPasswordChanged = async (req, res, next) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({
        error: "User profile not found",
        code: "USER_NOT_FOUND",
      });
    }

    const { revokeOtherSessions } = req.body || {};
    let sessionCleanupComplete = true;

    if (revokeOtherSessions) {
      try {
        const invalidation = await invalidateUserSessions({
          user,
          reason: "password_changed_revoke_others",
          req,
        });
        sessionCleanupComplete = !invalidation?.failures?.length;
      } catch (err) {
        logger.error({ err, userId: user._id }, "Failed to revoke other sessions on password change");
        sessionCleanupComplete = false;
      }
    }

    // Dispatch security notification email asynchronously
    const ipAddress = req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "Unknown";
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    sendPasswordChangedEmail({
      to: user.email,
      name: user.firstName || user.username || "there",
      timestamp,
      ipAddress,
    }).catch((emailErr) => {
      logger.error({ err: emailErr, userId: user._id }, "Failed to dispatch password changed security email");
    });

    // Record security audit trail
    await auditLogger.log({
      req,
      type: "security",
      action: "Password changed",
      severity: "info",
      userId: user._id,
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || user.email,
      userRole: user.role || "unknown",
      userEmail: user.email,
      ipAddress,
      userAgent: req.headers["user-agent"],
      metadata: {
        event: "password_change_success",
        revokeOtherSessions: Boolean(revokeOtherSessions),
        sessionCleanupComplete,
        timestamp: new Date().toISOString(),
      },
    }).catch((auditErr) => {
      logger.error({ err: auditErr, userId: user._id }, "Failed to log password change audit event");
    });

    return res.json({
      success: true,
      message: "Password change recorded and security notification dispatched.",
      sessionCleanupComplete,
    });
  } catch (error) {
    next(error);
  }
};
