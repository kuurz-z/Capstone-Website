import { User } from "../models/index.js";

export async function resolveAdminAccessContext(req) {
  const dbUser = await User.findOne({ firebaseUid: req.user.uid }).lean();

  return {
    role: dbUser?.role || "user",
    branch: dbUser?.branch || null,
    isOwner: dbUser?.role === "owner",
    _id: dbUser?._id || null,
    email: dbUser?.email || req.user?.email || "",
    displayName:
      `${dbUser?.firstName || ""} ${dbUser?.lastName || ""}`.trim() ||
      dbUser?.email ||
      "Admin",
  };
}
