const { v4: uuidv4 } = require('uuid');
const { Types: { ObjectId } } = require('mongoose');
const { getDb } = require('../config/database');
const { notifyNewAnnouncement } = require('../services/pushService');
const {
  normalizeBranch,
  buildTenantContext,
  canTenantViewAnnouncement,
} = require('../services/announcementAudience.service');

function normalizedBranchReference(reference) {
  const normalized = String(reference || '').trim().toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/[\s_]+/g, '-');
  if (/(^|-)guadalupe($|-)/.test(normalized)) return 'guadalupe';
  if (/(^|-)gil-?puyat($|-)/.test(normalized)) return 'gil-puyat';
  return normalized.replace(/^branch-/, '');
}

// Resolve the requesting tenant's authoritative branch code for filtering, or
// null if it can't be confirmed. Mirrors the same three room-assignment
// sources controllers/dashboard.controller.js already trusts for this
// tenant's current room/branch (roomoccupancyhistories -> bedhistories ->
// reservations), never a client-supplied value.
//
// Phase 4.5 cutover audit found getAllAnnouncements previously had NO branch
// filter at all — every branch-targeted announcement (pricing, incident
// notices, move-out schedules, security alerts) was returned to every
// authenticated tenant regardless of branch, a cross-branch data leak. This
// closes that gap; branch-restricted announcements are hidden (fail closed)
// when the requester's branch can't be confirmed, exactly like the
// standalone mobile backend's equivalent guard.
async function resolveRequesterBranchCode(db, mongoId) {
  if (!mongoId) return null;
  try {
    const occupancy = await db.collection('roomoccupancyhistories').findOne({ tenantId: mongoId, stayStatus: 'active' });
    // roomoccupancyhistories is legacy and has no Mongoose schema in this repo;
    // dashboard.controller.js and maintenance.controller.js both read this
    // collection's branch under `branchId`, not `branch`. Check both so this
    // resolver doesn't silently fail to resolve legacy occupancy records.
    if (occupancy?.branch || occupancy?.branchId) return normalizedBranchReference(occupancy.branch || occupancy.branchId);

    const bedHistory = await db.collection('bedhistories').findOne({
      tenantId: mongoId,
      $or: [{ status: 'active' }, { isActive: true }],
    });
    if (bedHistory?.branch) return normalizedBranchReference(bedHistory.branch);

    const reservation = await db.collection('reservations').findOne({
      $or: [{ userId: mongoId }, { tenantId: mongoId }],
      status: { $regex: /^(approved|confirmed|active|completed|checked_in|movein)$/i },
    }, { sort: { createdAt: -1 } });
    if (reservation?.branch) return normalizedBranchReference(reservation.branch);

    // Contract.branch (server/models/Contract.js) is a required, indexed
    // field set on every contract — the same authoritative value
    // /api/m/contracts/current already shows the tenant. Checked last so it
    // never overrides a more specific active-stay match above, but it covers
    // tenants whose branch is only recorded on their Contract and not yet
    // mirrored into the legacy occupancy/bed/reservation collections above,
    // which otherwise left Home/Profile showing "not available yet" while
    // the Contract screen correctly showed a real branch.
    const contract = await db.collection('contracts').findOne(
      { tenantId: mongoId, isCurrent: true },
      { sort: { createdAt: -1 } },
    );
    if (contract?.branch) return normalizedBranchReference(contract.branch);

    return null;
  } catch (_) {
    return null;
  }
}

// An announcement with no branch field (or blank) is global/legacy and stays
// visible to everyone. A private (user_id-targeted) announcement is already
// scoped to exactly one tenant by the query-level ownership filter, which is
// strictly more precise than a branch match, so branch filtering is skipped
// for private announcements (matches the standalone backend's rationale).
function isAnnouncementVisibleForBranch(doc, requesterBranchCode) {
  const isPrivate = doc.is_private === true || doc.isPrivate === true;
  if (isPrivate) return true;

  const branchRef = doc.branch || doc.branchId || doc.branch_id;
  if (!branchRef || !String(branchRef).trim()) return true;
  if (!requesterBranchCode) return false;
  return normalizedBranchReference(branchRef) === requesterBranchCode;
}

function isHexObjectId(val) {
  return typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val.trim());
}

function resolveAuthorName(doc, authorNameMap = new Map()) {
  const candidates = [
    doc.author_name,
    doc.authorName,
    doc.publishedByName,
    doc.publishedBy,
    doc.postedBy,
    doc.source_label,
    doc.createdBy,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'object' && candidate !== null) {
      if (['ObjectId', 'ObjectID'].includes(candidate._bsontype) || candidate.constructor?.name === 'ObjectId') {
        const idStr = candidate.toString();
        if (authorNameMap.has(idStr)) return authorNameMap.get(idStr);
      } else {
        const name = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim()
          || candidate.name || candidate.fullName || candidate.username || candidate.email;
        if (name && !isHexObjectId(name)) return name;
      }
    } else if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      if (isHexObjectId(trimmed)) {
        if (authorNameMap.has(trimmed)) return authorNameMap.get(trimmed);
      } else {
        return trimmed;
      }
    }
  }

  return 'LilyCrest Admin';
}

// Normalize a raw announcement document to the shape the mobile app expects.
// Admin-panel documents may use camelCase or different field names.
function normalizeAnnouncement(doc, authorNameMap = new Map()) {
  const id = doc.announcement_id || doc._id?.toString();
  const createdAt = doc.created_at || doc.createdAt || doc.publishedAt || null;

  // Priority: map admin values to app values
  const rawPriority = doc.priority || doc.importance || doc.type || 'normal';
  let priority = 'normal';
  if (/high|urgent|important/i.test(rawPriority)) priority = 'high';
  else if (/low|info/i.test(rawPriority)) priority = 'low';
  else priority = 'normal';

  // If web admin set isPinned, treat as high priority
  if (doc.isPinned && priority !== 'high') priority = 'high';

  return {
    announcement_id: id,
    title: doc.title || doc.subject || 'Announcement',
    content: doc.content || doc.message || doc.body || doc.description || '',
    author_name: resolveAuthorName(doc, authorNameMap),
    priority,
    category: doc.category || doc.type || 'General',
    is_urgent: doc.is_urgent || doc.isUrgent || priority === 'high',
    is_pinned: doc.isPinned || doc.is_pinned || false,
    created_at: createdAt,
    requiresAcknowledgment: Boolean(doc.requiresAcknowledgment),
    isRead: false, readAt: null, acknowledged: false, acknowledgedAt: null,
  };
}

// Get all announcements
async function getAllAnnouncements(req, res) {
  try {
    const db = getDb();
    const userId = req.user?.user_id || null;
    const userMongoId = req.user?._id || null;

    // Handle both snake_case (app-created) and camelCase (admin-panel-created) documents.
    // Web admin docs may lack is_active/isActive entirely — treat missing as active.
    const activeFilter = {
      $or: [
        { is_active: true },
        { isActive: true },
        { is_active: { $exists: false }, isActive: { $exists: false } },
      ],
    };
    // Exclude archived announcements (web admin uses isArchived)
    const notArchivedFilter = { isArchived: { $ne: true } };
    const visibilityFilter = {
      $or: [
        { is_private: { $ne: true }, isPrivate: { $ne: true } },
        ...(userId ? [{ is_private: true, user_id: userId }, { isPrivate: true, userId }] : []),
        ...(userMongoId ? [{ isPrivate: true, userId: userMongoId }] : []),
      ],
    };

    const announcements = await db.collection('announcements')
      .find({ $and: [activeFilter, notArchivedFilter, visibilityFilter] })
      .sort({ created_at: -1, createdAt: -1 })
      .toArray();

    // Resolve author names for any author/publishedBy/createdBy ObjectId references
    const authorIds = new Set();
    announcements.forEach((doc) => {
      [doc.author_name, doc.authorName, doc.publishedBy, doc.postedBy, doc.createdBy, doc.source_label].forEach((val) => {
        if (!val) return;
        if (typeof val === 'object' && (['ObjectId', 'ObjectID'].includes(val._bsontype) || val.constructor?.name === 'ObjectId')) {
          authorIds.add(val.toString());
        } else if (typeof val === 'string' && isHexObjectId(val)) {
          authorIds.add(val.trim());
        }
      });
    });

    const authorNameMap = new Map();
    if (authorIds.size > 0 && typeof db.collection === 'function') {
      try {
        const mongoIds = Array.from(authorIds).map((id) => {
          try { return new ObjectId(id); } catch (_) { return null; }
        }).filter(Boolean);

        const users = await db.collection('users').find({
          $or: [
            { _id: { $in: mongoIds } },
            { user_id: { $in: Array.from(authorIds) } },
          ],
        }).toArray();

        users.forEach((u) => {
          const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim()
            || u.name || u.fullName || u.username;
          let displayName = fullName;
          if (u.role === 'admin' || u.role === 'superadmin' || u.role === 'branch_admin') {
            displayName = fullName ? `${fullName} (Admin)` : 'LilyCrest Admin';
          }
          if (!displayName) displayName = 'LilyCrest Admin';

          if (u._id) authorNameMap.set(u._id.toString(), displayName);
          if (u.user_id) authorNameMap.set(String(u.user_id), displayName);
        });
      } catch (_) {
        // Fallback gracefully
      }
    }

    const tenantContext = await buildTenantContext(db, {
      tenant: req.user,
      userId,
      userMongoId,
    });
    let visible = announcements.filter((doc) => canTenantViewAnnouncement({ announcement: doc, tenantContext }));

    // News-tab dismissal is intentionally its own per-tenant state
    // (announcement_dismissals), separate from the Home bell's
    // notification_dismissals (server/services/mobileNotificationBridge.js).
    // The two feeds must be independently dismissible: hiding an item from
    // one must never hide (or otherwise affect) it in the other, and neither
    // ever mutates or deletes the shared announcement document itself.
    if (userId) {
      const dismissedIds = await getDismissedAnnouncementIds(db, userId);
      if (dismissedIds.size) {
        visible = visible.filter((doc) => !dismissedIds.has(doc.announcement_id || doc._id?.toString()));
      }
    }

    const { getEngagements } = require('../services/announcementEngagement.service');
    const engagements = await getEngagements(userMongoId, visible.map((doc) => doc._id));
    res.json(visible.map((doc) => ({
      ...normalizeAnnouncement(doc, authorNameMap),
      ...engagements.get(String(doc._id)),
    })));
  } catch (error) {
    console.error('getAllAnnouncements error:', error);
    res.status(500).json({ detail: 'Failed to fetch announcements' });
  }
}

async function getDismissedAnnouncementIds(db, userId) {
  try {
    const rows = await db.collection('announcement_dismissals')
      .find({ user_id: userId })
      .project({ announcement_id: 1 })
      .toArray();
    return new Set(rows.map((row) => row.announcement_id).filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

async function getAnnouncementDetail(req, res) {
  try {
    const db = getDb();
    const announcementId = String(req.params.announcementId || '').trim();
    if (!announcementId) {
      return res.status(400).json({ detail: 'announcementId is required.' });
    }

    const idFilter = isHexObjectId(announcementId)
      ? { $or: [{ announcement_id: announcementId }, { _id: new ObjectId(announcementId) }] }
      : { announcement_id: announcementId };
    const announcement = await db.collection('announcements').findOne(idFilter);
    const tenantContext = await buildTenantContext(db, {
      tenant: req.user,
      userId: req.user?.user_id || null,
      userMongoId: req.user?._id || null,
    });

    if (!announcement || !canTenantViewAnnouncement({ announcement, tenantContext })) {
      return res.status(404).json({ detail: 'Announcement not found.' });
    }

    const canonicalId = announcement.announcement_id || announcement._id?.toString();
    const dismissedIds = await getDismissedAnnouncementIds(db, req.user?.user_id || null);
    if (dismissedIds.has(canonicalId)) {
      return res.status(404).json({ detail: 'Announcement not found.' });
    }

    const { getEngagement, engageAnnouncement } = require('../services/announcementEngagement.service');
    const engagement = req.engagementAction
      ? await engageAnnouncement({ userId: req.user._id, announcementId: announcement._id, acknowledge: req.engagementAction === 'acknowledge', authorize: (current) => canTenantViewAnnouncement({ announcement: current, tenantContext }) })
      : await getEngagement(req.user._id, announcement._id);
    return res.json({ ...normalizeAnnouncement(announcement), ...engagement });
  } catch (error) {
    console.error('getAnnouncementDetail error:', error);
    return res.status([400, 404].includes(error.statusCode) ? error.statusCode : 503).json({ detail: error.statusCode === 400 ? 'No acknowledgement is needed for this announcement.' : error.statusCode === 404 ? 'This announcement is no longer available.' : 'Acknowledgement is temporarily unavailable. Please try again later.' });
  }
}

// Dismiss (per-tenant hide from the News tab only) a single announcement.
// This is a junction write to announcement_dismissals — it never deletes or
// mutates the shared `announcements` document, so the announcement stays
// fully intact and fully visible to every other tenant in its audience, to
// admins, and to this same tenant's Home bell feed (which reads its own,
// separate notification_dismissals state). 404s if the announcement isn't
// currently visible to this caller, so a client can't dismiss/probe another
// tenant's private announcement or a different branch's announcement by
// guessing an id.
async function dismissAnnouncement(req, res) {
  try {
    const db = getDb();
    const userId = req.user?.user_id || null;
    const userMongoId = req.user?._id || null;
    const announcementId = String(req.params.announcementId || req.params.id || '').trim();

    if (!userId) {
      return res.status(401).json({ detail: 'Authentication required.' });
    }
    if (!announcementId) {
      return res.status(400).json({ detail: 'announcementId is required.' });
    }

    const activeFilter = {
      $or: [
        { is_active: true },
        { isActive: true },
        { is_active: { $exists: false }, isActive: { $exists: false } },
      ],
    };
    const notArchivedFilter = { isArchived: { $ne: true } };
    const visibilityFilter = {
      $or: [
        { is_private: { $ne: true }, isPrivate: { $ne: true } },
        { is_private: true, user_id: userId },
        { isPrivate: true, userId },
        ...(userMongoId ? [{ isPrivate: true, userId: userMongoId }] : []),
      ],
    };
    const idFilter = isHexObjectId(announcementId)
      ? { $or: [{ announcement_id: announcementId }, { _id: new ObjectId(announcementId) }] }
      : { announcement_id: announcementId };

    const announcement = await db.collection('announcements').findOne({
      $and: [activeFilter, notArchivedFilter, visibilityFilter, idFilter],
    });

    if (!announcement) {
      return res.status(404).json({ detail: 'Announcement not found.' });
    }

    const tenantContext = await buildTenantContext(db, {
      tenant: req.user,
      userId,
      userMongoId,
    });
    if (!canTenantViewAnnouncement({ announcement, tenantContext })) {
      return res.status(404).json({ detail: 'Announcement not found.' });
    }

    const canonicalId = announcement.announcement_id || announcement._id?.toString();
    await db.collection('announcement_dismissals').updateOne(
      { user_id: userId, announcement_id: canonicalId },
      { $set: { dismissed_at: new Date() }, $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );

    return res.json({ status: 'dismissed', announcement_id: canonicalId });
  } catch (error) {
    console.error('dismissAnnouncement error:', error);
    return res.status(500).json({ detail: 'Failed to dismiss announcement' });
  }
}

// Reverse only this tenant's News-tab dismissal. The shared announcement is
// never mutated, and audience authorization is re-evaluated before the row is
// removed so Undo cannot be used to probe another branch's content.
async function restoreAnnouncement(req, res) {
  try {
    const db = getDb();
    const userId = req.user?.user_id || null;
    const announcementId = String(req.params.announcementId || '').trim();
    if (!userId) return res.status(401).json({ detail: 'Authentication required.' });
    if (!announcementId) return res.status(400).json({ detail: 'announcementId is required.' });

    const idFilter = isHexObjectId(announcementId)
      ? { $or: [{ announcement_id: announcementId }, { _id: new ObjectId(announcementId) }] }
      : { announcement_id: announcementId };
    const announcement = await db.collection('announcements').findOne(idFilter);
    const tenantContext = await buildTenantContext(db, {
      tenant: req.user,
      userId,
      userMongoId: req.user?._id || null,
    });
    if (!announcement || !canTenantViewAnnouncement({ announcement, tenantContext })) {
      return res.status(404).json({ detail: 'Announcement not found.' });
    }

    const canonicalId = announcement.announcement_id || announcement._id?.toString();
    await db.collection('announcement_dismissals').deleteOne({
      user_id: userId,
      announcement_id: canonicalId,
    });
    return res.json({ status: 'restored', announcement_id: canonicalId });
  } catch (error) {
    console.error('restoreAnnouncement error:', error);
    return res.status(500).json({ detail: 'Failed to restore announcement' });
  }
}

// Matches the two id shapes getAllAnnouncements can hand back: the explicit
// `ann_<hex>` field set at creation, or a legacy doc's raw ObjectId string.
const ANNOUNCEMENT_ID_PATTERN = /^(ann_[a-z0-9]{1,32}|[0-9a-fA-F]{24})$/i;
const MAX_BULK_DISMISS_IDS = 100;

// Multi-select hide for the News tab — same per-tenant junction write as
// dismissAnnouncement, just batched. Validates every entry up front (well
// formed, actually exists, and visible to this caller) and rejects the
// whole request rather than silently dropping a bad id or writing a
// dismissal row for an announcement this tenant couldn't otherwise see.
async function dismissAnnouncementsBulk(req, res) {
  try {
    const userId = req.user?.user_id || null;
    const userMongoId = req.user?._id || null;
    if (!userId) {
      return res.status(401).json({ detail: 'Authentication required.' });
    }

    const rawIds = req.body?.ids;
    if (!Array.isArray(rawIds) || !rawIds.length) {
      return res.status(400).json({ detail: 'ids must be a non-empty array.' });
    }
    if (rawIds.length > MAX_BULK_DISMISS_IDS) {
      return res.status(400).json({ detail: `ids must contain ${MAX_BULK_DISMISS_IDS} or fewer entries.` });
    }
    if (!rawIds.every((id) => typeof id === 'string' && ANNOUNCEMENT_ID_PATTERN.test(id.trim()))) {
      return res.status(400).json({ detail: 'ids must all be valid announcement ids.' });
    }
    const ids = [...new Set(rawIds.map((id) => id.trim()))];

    const db = getDb();
    const activeFilter = {
      $or: [
        { is_active: true },
        { isActive: true },
        { is_active: { $exists: false }, isActive: { $exists: false } },
      ],
    };
    const notArchivedFilter = { isArchived: { $ne: true } };
    const visibilityFilter = {
      $or: [
        { is_private: { $ne: true }, isPrivate: { $ne: true } },
        { is_private: true, user_id: userId },
        { isPrivate: true, userId },
        ...(userMongoId ? [{ isPrivate: true, userId: userMongoId }] : []),
      ],
    };
    const idFilter = {
      $or: ids.flatMap((id) => (isHexObjectId(id)
        ? [{ announcement_id: id }, { _id: new ObjectId(id) }]
        : [{ announcement_id: id }])),
    };

    const matches = await db.collection('announcements').find({
      $and: [activeFilter, notArchivedFilter, visibilityFilter, idFilter],
    }).toArray();

    const tenantContext = await buildTenantContext(db, {
      tenant: req.user,
      userId,
      userMongoId,
    });
    const visibleMatches = matches.filter((doc) => canTenantViewAnnouncement({ announcement: doc, tenantContext }));
    const visibleIds = new Set(visibleMatches.map((doc) => doc.announcement_id || doc._id?.toString()));

    if (visibleIds.size !== ids.length) {
      // Same 404 semantics as the single-dismiss endpoint: a caller can't
      // learn anything about an id that doesn't exist, isn't theirs, or
      // isn't in their branch by including it in a bulk request either.
      return res.status(404).json({ detail: 'One or more announcements were not found.' });
    }

    const now = new Date();
    const operations = ids.map((announcementId) => ({
      updateOne: {
        filter: { user_id: userId, announcement_id: announcementId },
        update: { $set: { dismissed_at: now }, $setOnInsert: { created_at: now } },
        upsert: true,
      },
    }));
    await db.collection('announcement_dismissals').bulkWrite(operations);

    return res.json({ status: 'dismissed', announcement_ids: ids });
  } catch (error) {
    console.error('dismissAnnouncementsBulk error:', error);
    return res.status(500).json({ detail: 'Failed to dismiss announcements' });
  }
}

// Admin: create a new announcement and push-notify all tenants
async function createAnnouncement(req, res) {
  try {
    const { title, content, priority, category, is_urgent, is_private, user_id: targetUserId } = req.body;
    if (!title || !content) {
      return res.status(400).json({ detail: 'title and content are required' });
    }

    const db = getDb();
    const requestedTargetBranch = normalizeBranch(
      req.mobileBranchScope || req.body.targetBranch || req.body.branch || 'both',
    );
    if (!['both', 'gil-puyat', 'guadalupe'].includes(requestedTargetBranch)) {
      return res.status(400).json({ detail: 'A valid targetBranch is required.' });
    }
    const announcement = {
      announcement_id: `ann_${uuidv4().replace(/-/g, '').substring(0, 12)}`,
      title,
      content,
      author_name: req.user?.name || req.user?.fullName || 'LilyCrest Admin',
      priority: priority || 'normal',
      category: category || 'General',
      is_urgent: is_urgent || priority === 'high' || false,
      is_active: true,
      is_private: is_private || false,
      user_id: targetUserId || null,
      targetBranch: requestedTargetBranch,
      visibility: 'tenants-only',
      publicationStatus: 'published',
      startsAt: new Date(),
      publishedAt: new Date(),
      isArchived: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    await db.collection('announcements').insertOne(announcement);

    // Push notification to all tenants (non-blocking, skip for private targeted announcements)
    if (!announcement.is_private) {
      notifyNewAnnouncement(db, announcement).catch(() => {});
    }

    res.status(201).json(normalizeAnnouncement(announcement));
  } catch (error) {
    console.error('createAnnouncement error:', error);
    res.status(500).json({ detail: 'Failed to create announcement' });
  }
}

module.exports = {
  markRead: (req, res) => { req.engagementAction = 'read'; return getAnnouncementDetail(req, res); },
  acknowledge: (req, res) => { req.engagementAction = 'acknowledge'; return getAnnouncementDetail(req, res); },
  getAllAnnouncements,
  getAnnouncementDetail,
  createAnnouncement,
  dismissAnnouncement,
  dismissAnnouncementsBulk,
  restoreAnnouncement,
  resolveRequesterBranchCode,
  normalizedBranchReference: normalizeBranch,
};
