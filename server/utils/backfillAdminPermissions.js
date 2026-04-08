import { User } from "../models/index.js";
import logger from "../middleware/logger.js";
import { getDefaultPermissionsForRole } from "../config/accessControl.js";

export async function backfillBranchAdminPermissions() {
  const branchAdminPermissions = getDefaultPermissionsForRole("branch_admin");

  const result = await User.updateMany(
    {
      role: "branch_admin",
      $or: [
        { permissions: { $exists: false } },
        { permissions: null },
        { permissions: { $size: 0 } },
      ],
    },
    {
      $set: { permissions: branchAdminPermissions },
    },
  );

  if (result.modifiedCount > 0) {
    logger.info(
      { count: result.modifiedCount },
      "Backfilled explicit permissions for branch admins",
    );
  }

  return result.modifiedCount || 0;
}

export default backfillBranchAdminPermissions;
