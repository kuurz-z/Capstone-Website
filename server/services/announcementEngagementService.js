import mongoose from "mongoose";
import AcknowledgmentAccount from "../models/AcknowledgmentAccount.js";
import Announcement from "../models/Announcement.js";

export const engagementDto = (row) => ({
  isRead: Boolean(row?.isRead), readAt: row?.readAt || null,
  acknowledged: Boolean(row?.isAcknowledged), acknowledgedAt: row?.acknowledgedAt || null,
});
export async function getEngagement(userId, announcementId) {
  return engagementDto(await AcknowledgmentAccount.findOne({ userId, announcementId }).lean());
}
export async function getEngagements(userId, announcementIds) {
  const rows = await AcknowledgmentAccount.find({ userId, announcementId: { $in: announcementIds } }).lean();
  return new Map(rows.map((row) => [String(row.announcementId), engagementDto(row)]));
}
// The unique audience index and transaction protect both the first timestamp
// and the cached Admin counters, including concurrent Web/Mobile requests.
export async function engageAnnouncement({ userId, announcementId, acknowledge = false, authorize = () => true }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const announcement = await Announcement.findById(announcementId).session(session).lean();
        if (!announcement || announcement.isArchived || !await authorize(announcement, session)) throw Object.assign(new Error("This announcement is no longer available."), { statusCode: 404 });
        if (acknowledge && !announcement.requiresAcknowledgment) throw Object.assign(new Error("No acknowledgement is needed for this announcement."), { statusCode: 400 });
        let row = await AcknowledgmentAccount.findOne({ userId, announcementId }).session(session);
        if (!row) row = new AcknowledgmentAccount({ userId, announcementId });
        const firstRead = !row.isRead;
        const firstAck = acknowledge && !row.isAcknowledged;
        const now = new Date();
        if (firstRead) { row.isRead = true; row.readAt = now; }
        if (firstAck) { row.isAcknowledged = true; row.acknowledgedAt = now; }
        if (row.isNew || firstRead || firstAck) await row.save({ session });
        if (firstRead || firstAck) await Announcement.updateOne({ _id: announcementId }, {
          $inc: { viewCount: firstRead ? 1 : 0, acknowledgmentCount: firstAck ? 1 : 0 },
        }, { session });
        result = engagementDto(row);
      });
      return result;
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (attempt === 2) throw Object.assign(new Error("Acknowledgement is temporarily unavailable. Please try again later."), { statusCode: 503 });
    } finally { await session.endSession(); }
  }
}
