export const UNKNOWN_USER_LABEL = "Unknown";
export const UNKNOWN_TENANT_LABEL = "Unknown Tenant";
export const DELETED_ACCOUNT_LABEL = "Deleted account";

export function extractReferencedUserId(userRef) {
  if (!userRef) return null;
  if (typeof userRef === "string") return userRef;
  if (typeof userRef === "object" && userRef._id) return String(userRef._id);
  if (typeof userRef.toString === "function") {
    const value = String(userRef);
    return value && value !== "[object Object]" ? value : null;
  }
  return null;
}

export function buildUserDisplayName(user, fallback = "") {
  if (!user || typeof user !== "object") return fallback;
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return fullName || user.email || user.user_id || fallback;
}

export function resolveReferencedUser(userRef, options = {}) {
  const {
    unknownLabel = UNKNOWN_USER_LABEL,
    deletedLabel = DELETED_ACCOUNT_LABEL,
  } = options;

  const referenceId = extractReferencedUserId(userRef);
  const hasResolvedUser =
    Boolean(userRef) &&
    typeof userRef === "object" &&
    !Array.isArray(userRef) &&
    Boolean(
      userRef.firstName ||
        userRef.lastName ||
        userRef.email ||
        userRef.user_id ||
        userRef.accountStatus,
    );

  if (hasResolvedUser) {
    return {
      id: referenceId,
      name: buildUserDisplayName(userRef, unknownLabel),
      email: userRef.email || null,
      accountStatus: userRef.accountStatus || "active",
      isDeleted: false,
      isBlocked: userRef.accountStatus === "banned" && userRef.isArchived !== true,
    };
  }

  if (referenceId) {
    return {
      id: referenceId,
      name: deletedLabel,
      email: null,
      accountStatus: null,
      isDeleted: true,
      isBlocked: false,
    };
  }

  return {
    id: null,
    name: unknownLabel,
    email: null,
    accountStatus: null,
    isDeleted: false,
    isBlocked: false,
  };
}
