/**
 * =============================================================================
 * BRANCH ACCESS CONTROL MIDDLEWARE
 * =============================================================================
 *
 * Middleware functions for enforcing branch-based data separation.
 *
 * Business Rules:
 * - Regular admins can only access data from their assigned branch
 * - Super admins can access data from ALL branches
 * - Users without a branch assignment cannot access branch-specific data
 *
 * Usage:
 *   router.get('/data', verifyToken, verifyAdmin, filterByBranch, handler)
 */

import { User, INQUIRY_BRANCHES } from "../models/index.js";

/**
 * Get User's Branch and Role
 *
 * Helper function to retrieve the current user's branch assignment and role.
 *
 * @param {string} firebaseUid - Firebase UID of the user
 * @returns {Object} { branch, role, isSuperAdmin }
 */
export const getUserBranchInfo = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid }).select("branch role");

  if (!user) {
    return { branch: null, role: null, isSuperAdmin: false };
  }

  return {
    branch: user.branch,
    role: user.role,
    isSuperAdmin: user.role === "superAdmin",
  };
};

/**
 * Filter By Branch Middleware
 *
 * Attaches branch filtering information to the request.
 * - Super admins: req.branchFilter = null (access all)
 * - Regular admins: req.branchFilter = their assigned branch
 *
 * Must be used AFTER verifyToken middleware.
 *
 * @middleware
 */
export const filterByBranch = async (req, res, next) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: "User not authenticated",
        code: "USER_NOT_AUTHENTICATED",
      });
    }

    const { branch, role, isSuperAdmin } = await getUserBranchInfo(
      req.user.uid,
    );

    // Super admins can access all branches
    if (isSuperAdmin) {
      req.branchFilter = null; // No filter - access all
      req.userBranch = "all";
      req.isSuperAdmin = true;
      return next();
    }

    // Regular admins must have a branch assigned
    if (!branch) {
      return res.status(403).json({
        error: "No branch assigned. Please contact a super admin.",
        code: "NO_BRANCH_ASSIGNED",
      });
    }

    // Set branch filter for regular admins
    req.branchFilter = branch;
    req.userBranch = branch;
    req.isSuperAdmin = false;

    next();
  } catch (error) {
    console.error("❌ Branch filter error:", error.message);
    res.status(500).json({
      error: "Failed to verify branch access",
      code: "BRANCH_ACCESS_ERROR",
    });
  }
};

/**
 * Validate Branch Parameter
 *
 * Validates that the requested branch is valid and the user has access.
 * Used for routes that accept a branch parameter.
 *
 * @middleware
 */
export const validateBranchAccess = async (req, res, next) => {
  try {
    const requestedBranch =
      req.params.branch || req.query.branch || req.body.branch;

    if (!req.user || !req.user.uid) {
      return res.status(401).json({
        error: "User not authenticated",
        code: "USER_NOT_AUTHENTICATED",
      });
    }

    const { branch, isSuperAdmin } = await getUserBranchInfo(req.user.uid);

    // Validate branch value using INQUIRY_BRANCHES constant
    if (requestedBranch && !INQUIRY_BRANCHES.includes(requestedBranch)) {
      return res.status(400).json({
        error: `Invalid branch. Must be one of: ${INQUIRY_BRANCHES.join(", ")}`,
        code: "INVALID_BRANCH",
      });
    }

    // Super admins can access any branch
    if (isSuperAdmin) {
      req.isSuperAdmin = true;
      return next();
    }

    // Regular admins can only access their assigned branch
    if (
      requestedBranch &&
      requestedBranch !== branch &&
      requestedBranch !== "general"
    ) {
      return res.status(403).json({
        error: `Access denied. You can only access ${branch} branch data.`,
        code: "BRANCH_ACCESS_DENIED",
      });
    }

    next();
  } catch (error) {
    console.error("❌ Branch validation error:", error.message);
    res.status(500).json({
      error: "Failed to validate branch access",
      code: "BRANCH_VALIDATION_ERROR",
    });
  }
};
