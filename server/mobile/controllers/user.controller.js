const { getDb } = require('../config/database');
const { Types: { ObjectId } } = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { resolveRequesterBranchCode } = require('./announcement.controller');
const { MOBILE_BRANCH_LOCATIONS } = require('../config/branchLocations');
const { withTenantOnboardingState } = require('../utils/tenantOnboarding');

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

// Normalize a raw MongoDB user document to the shape the app expects.
// Admin-panel documents use camelCase (fullName, emailAddress, contactNumber, etc.)
// while app-created documents use snake_case (name, email, phone).
// This bridges both schemas so the mobile app always sees consistent field names.
function normalizeUser(doc) {
  if (!doc) return doc;
  const u = { ...doc };

  const applicant = (u.applicantDetails && typeof u.applicantDetails === 'object')
    ? u.applicantDetails
    : ((u.applicant_details && typeof u.applicant_details === 'object') ? u.applicant_details : {});

  const applicantFirstName = firstNonEmptyString(
    applicant.firstName,
    applicant.first_name,
    u.firstName,
    u.first_name,
  );
  const applicantLastName = firstNonEmptyString(
    applicant.lastName,
    applicant.last_name,
    u.lastName,
    u.last_name,
  );

  if (!u.firstName && applicantFirstName) u.firstName = applicantFirstName;
  if (!u.lastName && applicantLastName) u.lastName = applicantLastName;

  // Name: always recompute from the current firstName/lastName (the fields
  // the web profile editor writes to) so an edit made on the web reflects
  // here immediately, instead of only filling `name` once and letting it
  // go stale after later web-side edits.
  const combinedName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (combinedName) {
    u.name = combinedName;
  } else if (!u.name) {
    const applicantFullName = [applicantFirstName, applicantLastName].filter(Boolean).join(' ').trim();
    if (applicantFullName) {
      u.name = applicantFullName;
    } else if (u.fullName) {
      u.name = u.fullName;
    }
  }

  // Email: emailAddress → email
  if (!u.email && u.emailAddress) u.email = u.emailAddress;

  // Phone: contactNumber / phoneNumber → phone
  if (!u.phone && (u.contactNumber || u.phoneNumber)) {
    u.phone = u.contactNumber || u.phoneNumber;
  }

  // Profile photo: the web profile editor writes to `profileImage`, while
  // the mobile app reads/writes `picture`. Neither side knows about the
  // other's field, so a photo change on one platform was invisible on the
  // other. Fall back to whichever field actually has a value so both
  // clients converge on the same photo.
  if (!u.picture && u.profileImage) u.picture = u.profileImage;

  // Address from applicant details/home address fields → address
  if (!u.address) {
    u.address = firstNonEmptyString(
      applicant.address,
      applicant.homeAddress,
      applicant.home_address,
      applicant.currentAddress,
      applicant.current_address,
      u.homeAddress,
      u.home_address,
    );
  }

  // Username: fallback to email prefix if missing
  if (!u.username && u.email) {
    u.username = u.email.split('@')[0];
  }

  return withTenantOnboardingState(u);
}

// Client-visible field allowlist — mirrors the currently-live standalone
// mobile backend's utils/normalizeUser.js CLIENT_VISIBLE_USER_FIELDS.
//
// Phase 4.5 cutover audit found this canonical getMe/dashboard previously
// returned the ENTIRE raw `users` Mongo document to the mobile client
// (`normalizeUser(user)` with no allowlist, dashboard.controller.js used
// `{ ...req.user, _id: undefined }`) — leaking every internal field ever
// written to that document (push tokens, admin-only flags, hashed
// credentials if present, etc.) to any authenticated tenant. This allowlist
// closes that gap; only these fields are ever sent to the mobile client.
const CLIENT_VISIBLE_USER_FIELDS = [
  'user_id', 'email', 'name', 'firstName', 'middleName', 'lastName', 'phone', 'address',
  'username', 'usernameNextAllowedAt', 'serverTime', 'picture', 'role',
  'tenantOnboardingSeen',
  // Extended profile fields the web profile editor writes to
  // (authController.js updateProfile). These are read-only on mobile today
  // — surfacing them here just lets the app display what was set on web,
  // matching the "managed from the approved application / admin" rule in
  // updateMe below, which intentionally still does not accept them from
  // mobile.
  'gender', 'civilStatus', 'nationality', 'occupation', 'educationLevel', 'dateOfBirth',
];

function sanitizeUserForClient(user) {
  if (!user) return user;
  const safe = {};
  for (const field of CLIENT_VISIBLE_USER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(user, field)) {
      safe[field] = user[field];
    }
  }
  return safe;
}

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function usernameCooldownState(lastUsernameChangedAt, now = new Date()) {
  const lastChanged = lastUsernameChangedAt ? new Date(lastUsernameChangedAt) : null;
  if (!lastChanged || Number.isNaN(lastChanged.getTime())) return { active: false, nextAllowedAt: null };
  const nextAllowedAt = new Date(lastChanged.getTime() + USERNAME_COOLDOWN_MS);
  return { active: now < nextAllowedAt, nextAllowedAt };
}

// Attach the same usernameNextAllowedAt/serverTime fields the frontend's
// cooldown UI depends on (profile.jsx reads user.usernameNextAllowedAt /
// user.serverTime — see AuthContext.js's 429 USERNAME_COOLDOWN handling)
// so cooldown state is visible even outside the 429 error path (e.g. after
// an app restart / session hydration via GET /users/me).
function withUsernameCooldownFields(user, now = new Date()) {
  const cooldown = usernameCooldownState(user.lastUsernameChangedAt, now);
  return {
    ...user,
    usernameNextAllowedAt: cooldown.active ? cooldown.nextAllowedAt : null,
    serverTime: now,
  };
}

// Resolve the authenticated tenant's Branch location object for the mobile
// Profile/Home screens (branchName/branchAddress/googleMapsUrl/isActive —
// the exact fields those screens read off `user.branch`). Reuses the same
// server-authoritative resolver announcement.controller.js already uses for
// branch-visibility filtering (current stay/room assignment -> reservation,
// never a client-supplied value) rather than a second redundant lookup.
// Returns null (never a guessed branch) when it can't be confirmed, e.g. a
// legacy user record or an applicant with no room-bearing reservation yet —
// the frontend already renders "Branch location is not available yet." for
// a null/absent branch.
async function resolveTenantBranchLocation(db, mongoId) {
  const branchCode = await resolveRequesterBranchCode(db, mongoId);
  if (!branchCode) return null;
  return MOBILE_BRANCH_LOCATIONS[branchCode] || null;
}

async function buildCanonicalUserProfile(db, userId, mongoId, now = new Date()) {
  const user = await db.collection('users').findOne(
    { user_id: userId },
    { projection: { _id: 0 } },
  );
  if (!user) return null;

  const branch = await resolveTenantBranchLocation(db, mongoId);
  return {
    ...sanitizeUserForClient(withUsernameCooldownFields(normalizeUser(user), now)),
    branch,
  };
}

// Get current user profile
async function getMe(req, res) {
  try {
    const db = getDb();
    const user = await buildCanonicalUserProfile(db, req.user.user_id, req.user._id);

    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('getMe error:', error);
    res.status(500).json({ detail: 'Failed to load profile' });
  }
}

// Persist completion or an intentional skip for the authenticated active
// tenant only. The null filter makes the first write atomic and preserves the
// original first-seen timestamp on retries.
async function markTenantOnboardingSeen(req, res) {
  try {
    const db = getDb();
    await db.collection('users').updateOne(
      {
        user_id: req.user.user_id,
        tenant_onboarding_seen_at: null,
      },
      { $set: { tenant_onboarding_seen_at: new Date() } },
    );

    const user = await buildCanonicalUserProfile(db, req.user.user_id, req.user._id);
    if (!user) return res.status(404).json({ detail: 'User not found' });
    return res.json(user);
  } catch (error) {
    console.error('Mark tenant onboarding seen error:', error);
    return res.status(500).json({ detail: 'Failed to save your guide preference.' });
  }
}

// ── Field-level validators ──
const NAME_MIN = 2;
const NAME_MAX = 60;
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const PHONE_REGEX = /^\+63\d{10}$/;
const ADDRESS_MAX = 200;
const PICTURE_URL_MAX = 4096;
const DOC_MAX_BYTES = 5 * 1024 * 1024; // 5 MB for document uploads

function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}

function validateField(field, value) {
  switch (field) {
    case 'name': {
      const clean = sanitize(value);
      if (!clean) return { ok: false, error: 'Name is required.' };
      if (clean.length < NAME_MIN) return { ok: false, error: `Name must be at least ${NAME_MIN} characters.` };
      if (clean.length > NAME_MAX) return { ok: false, error: `Name must be at most ${NAME_MAX} characters.` };
      if (!/^[a-zA-Z\u00c0-\u00ff\u00f1\u00d1\s.\-']+$/.test(clean)) return { ok: false, error: 'Name contains invalid characters.' };
      return { ok: true, value: clean };
    }
    case 'username': {
      const clean = sanitize(value).toLowerCase();
      if (!clean) return { ok: false, error: 'Username is required.' };
      if (clean.length < USERNAME_MIN) return { ok: false, error: `Username must be at least ${USERNAME_MIN} characters.` };
      if (clean.length > USERNAME_MAX) return { ok: false, error: `Username must be at most ${USERNAME_MAX} characters.` };
      if (!USERNAME_REGEX.test(clean)) return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' };
      return { ok: true, value: clean };
    }
    case 'email': {
      const clean = sanitize(value).toLowerCase();
      if (!clean) return { ok: false, error: 'Email is required.' };
      if (clean.length > EMAIL_MAX) return { ok: false, error: 'Email address is too long.' };
      if (!EMAIL_REGEX.test(clean)) return { ok: false, error: 'Please provide a valid email address.' };
      return { ok: true, value: clean };
    }
    case 'phone': {
      if (!value || value.trim() === '' || value.trim() === '+63') return { ok: true, value: '' }; // optional
      const compact = value.replace(/[\s\-()]/g, '');
      if (!PHONE_REGEX.test(compact)) return { ok: false, error: 'Phone must be in +63XXXXXXXXXX format (10 digits after +63).' };
      return { ok: true, value: compact };
    }
    case 'address': {
      const clean = sanitize(value);
      if (clean.length > ADDRESS_MAX) return { ok: false, error: `Address must be at most ${ADDRESS_MAX} characters.` };
      return { ok: true, value: clean };
    }
    case 'picture': {
      if (typeof value !== 'string') return { ok: false, error: 'Picture must be a string.' };
      const clean = value.trim();
      if (!clean) return { ok: true, value: '' };
      if (clean.length > PICTURE_URL_MAX) return { ok: false, error: 'Picture URL is too long.' };
      try {
        const parsed = new URL(clean);
        if (parsed.protocol !== 'https:') {
          return { ok: false, error: 'Picture must use a permanent HTTPS URL.' };
        }
      } catch (_) {
        return { ok: false, error: 'Picture must use a valid permanent HTTPS URL.' };
      }
      return { ok: true, value: clean };
    }
    default:
      return { ok: false, error: `Unknown field: ${field}` };
  }
}

// Update current user — with full validation + uniqueness checks
async function updateMe(req, res) {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ detail: 'Request body is required.' });
    }

    // Only username/phone/picture are tenant-editable — name/email/address
    // are managed from the approved tenant application / admin, matching the
    // currently-live standalone mobile backend's business rule (see
    // backend/controllers/user.controller.js updateMe). Phase 4.5 cutover
    // audit found this canonical handler previously allowed a tenant to
    // self-edit their legal name, sign-in email, and application-derived
    // address, bypassing the admin-verification workflow — closed here by
    // simply never accepting those fields (silently ignored if sent, same
    // as any other unrecognized body field).
    const allowedFields = ['username', 'phone', 'picture'];
    const updateData = {};
    const fieldErrors = {};

    // Only validate fields that were actually sent
    for (const field of allowedFields) {
      if (updates[field] === undefined) continue;

      const result = validateField(field, updates[field]);
      if (!result.ok) {
        fieldErrors[field] = result.error;
      } else {
        updateData[field] = result.value;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ detail: 'Validation failed.', errors: fieldErrors });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ detail: 'No valid fields provided to update.' });
    }

    // Mirror the photo into the field the web profile editor reads
    // (`profileImage`) so a photo set on mobile shows up on web too.
    if (updateData.picture !== undefined) {
      updateData.profileImage = updateData.picture;
    }

    const db = getDb();
    const userId = req.user.user_id;
    const now = new Date();

    // Uniqueness + cooldown checks for username
    if (updateData.username) {
      const currentUser = await db.collection('users').findOne(
        { user_id: userId },
        { projection: { username: 1, lastUsernameChangedAt: 1 } },
      );
      const currentUsername = String(currentUser?.username || '').trim().toLowerCase();

      if (updateData.username !== currentUsername) {
        // 7-day username-change cooldown, matching the currently-live
        // standalone mobile backend (backend/controllers/user.controller.js
        // usernameCooldownState). Phase 4.5 audit found this canonical
        // handler had no cooldown at all, letting a tenant change their
        // username unlimited times — closed here, same 429 wire contract
        // AuthContext.js/profile.jsx already expect (code: 'USERNAME_COOLDOWN',
        // errors.username, nextAllowedAt, serverTime).
        const cooldown = usernameCooldownState(currentUser?.lastUsernameChangedAt, now);
        if (cooldown.active) {
          return res.status(429).json({
            detail: `You can change your username again on ${cooldown.nextAllowedAt.toISOString()}.`,
            code: 'USERNAME_COOLDOWN',
            errors: { username: 'Username change is still under cooldown.' },
            nextAllowedAt: cooldown.nextAllowedAt,
            serverTime: now,
          });
        }

        const usernameRegex = new RegExp(`^${updateData.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const existingUsername = await db.collection('users').findOne({
          username: usernameRegex,
          user_id: { $ne: userId },
        });
        if (existingUsername) {
          return res.status(400).json({ detail: 'Validation failed.', errors: { username: 'This username is already taken.' } });
        }
        updateData.lastUsernameChangedAt = now;
      } else {
        // No-op username (equal to current) — do not touch the cooldown.
        delete updateData.username;
      }
    }

    if (Object.keys(updateData).length === 0) {
      const currentUser = await db.collection('users').findOne({ user_id: userId }, { projection: { _id: 0 } });
      const branch = await resolveTenantBranchLocation(db, req.user._id);
      return res.json({
        ...sanitizeUserForClient(withUsernameCooldownFields(normalizeUser(currentUser), now)),
        branch,
      });
    }

    updateData.updated_at = now;

    await db.collection('users').updateOne(
      { user_id: userId },
      { $set: updateData }
    );

    const updatedUser = await db.collection('users').findOne(
      { user_id: userId },
      { projection: { _id: 0 } }
    );

    // Include `branch` on every profile response (not just getMe) so the
    // frontend's updateUser() merge (setUser(prev => ({...prev, ...data})))
    // never overwrites a previously-known branch with undefined after an
    // unrelated field edit (username/phone/picture).
    const branch = await resolveTenantBranchLocation(db, req.user._id);
    res.json({
      ...sanitizeUserForClient(withUsernameCooldownFields(normalizeUser(updatedUser), now)),
      branch,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ detail: 'Failed to update user' });
  }
}

// ── Document upload/management ──

const ALLOWED_DOC_TYPES = [
  'government_id', 'passport', 'drivers_license', 'student_id', 'company_id',
  'lease_extension', 'proof_of_income', 'authorization_letter', 'other',
];

const DOC_TYPE_LABELS = {
  government_id: 'Government ID',
  passport: 'Passport',
  drivers_license: "Driver's License",
  student_id: 'Student ID',
  company_id: 'Company/Employee ID',
  lease_extension: 'Lease Extension',
  proof_of_income: 'Proof of Income',
  authorization_letter: 'Authorization Letter',
  other: 'Other Document',
};

// Upload a document (ID or file)
async function uploadDocument(req, res) {
  try {
    const { type, label, file_data } = req.body;

    if (!type || !ALLOWED_DOC_TYPES.includes(type)) {
      return res.status(400).json({ detail: `Invalid document type. Allowed: ${ALLOWED_DOC_TYPES.join(', ')}` });
    }
    if (!file_data || typeof file_data !== 'string') {
      return res.status(400).json({ detail: 'file_data is required (base64 encoded).' });
    }
    if (!file_data.startsWith('data:image/') && !file_data.startsWith('data:application/pdf')) {
      return res.status(400).json({ detail: 'File must be an image or PDF.' });
    }
    if (file_data.length > DOC_MAX_BYTES) {
      return res.status(400).json({ detail: 'File is too large (max 5 MB).' });
    }

    const docId = `doc_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    const docEntry = {
      doc_id: docId,
      type,
      label: sanitize(label) || DOC_TYPE_LABELS[type] || type,
      file_data,
      uploaded_at: new Date(),
      status: 'pending_review',
    };

    const db = getDb();
    await db.collection('users').updateOne(
      { user_id: req.user.user_id },
      { $push: { uploaded_documents: docEntry } }
    );

    res.status(201).json({
      doc_id: docId,
      type: docEntry.type,
      label: docEntry.label,
      uploaded_at: docEntry.uploaded_at,
      status: docEntry.status,
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ detail: 'Failed to upload document' });
  }
}

// ── Map reservation document fields to structured entries ──
const VALID_ID_TYPE_LABELS = {
  national_id: 'National ID',
  passport: 'Passport',
  drivers_license: "Driver's License",
  sss: 'SSS ID',
  philhealth: 'PhilHealth ID',
  tin: 'TIN ID',
  postal: 'Postal ID',
  voters: "Voter's ID",
  prc: 'PRC ID',
  umid: 'UMID',
  student_id: 'Student ID',
};

function buildReservationDocs(reservation) {
  if (!reservation) return [];
  const docs = [];
  const resId = reservation._id?.toString() || 'unknown';
  const submittedAt = reservation.applicationSubmittedAt || reservation.createdAt || new Date();

  if (reservation.validIDFrontUrl) {
    const idLabel = VALID_ID_TYPE_LABELS[reservation.validIDType] || 'Valid ID';
    docs.push({
      doc_id: `res_${resId}_valid_id_front`,
      type: 'government_id',
      label: `${idLabel} (Front)`,
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.validIDFrontUrl,
    });
  }
  if (reservation.validIDBackUrl) {
    const idLabel = VALID_ID_TYPE_LABELS[reservation.validIDType] || 'Valid ID';
    docs.push({
      doc_id: `res_${resId}_valid_id_back`,
      type: 'government_id',
      label: `${idLabel} (Back)`,
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.validIDBackUrl,
    });
  }
  if (reservation.selfiePhotoUrl) {
    docs.push({
      doc_id: `res_${resId}_selfie`,
      type: 'government_id',
      label: 'Selfie Photo',
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.selfiePhotoUrl,
    });
  }
  if (reservation.nbiClearanceUrl) {
    docs.push({
      doc_id: `res_${resId}_nbi`,
      type: 'other',
      label: 'NBI Clearance',
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.nbiClearanceUrl,
    });
  }
  if (reservation.companyIDUrl) {
    docs.push({
      doc_id: `res_${resId}_company_id`,
      type: 'company_id',
      label: 'Company / Employee ID',
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.companyIDUrl,
    });
  }
  if (reservation.proofOfPaymentUrl) {
    docs.push({
      doc_id: `res_${resId}_proof_of_payment`,
      type: 'other',
      label: 'Proof of Payment',
      status: 'verified',
      uploaded_at: submittedAt,
      source: 'reservation',
      file_url: reservation.proofOfPaymentUrl,
    });
  }
  // Contract files are intentionally excluded. Mobile Contract access is served
  // from the tenant-owned canonical Contract record, never a Reservation URL.

  return docs;
}

// Get user's uploaded documents (without file_data to keep response light)
// Also includes documents submitted during the reservation process on the web
async function getUserDocuments(req, res) {
  try {
    const db = getDb();
    const user = await db.collection('users').findOne(
      { user_id: req.user.user_id },
      { projection: { uploaded_documents: 1, _id: 1 } }
    );

    // Mobile-uploaded documents (strip file_data for listing)
    const uploadedDocs = (user?.uploaded_documents || []).map(({ file_data, ...rest }) => rest);

    // Reservation documents (from the web admin reservation flow)
    let reservationDocs = [];
    const mongoId = user?._id;
    if (mongoId) {
      const reservation = await db.collection('reservations').findOne(
        { userId: mongoId, status: { $in: ['moveIn', 'active', 'completed', 'payment_pending', 'confirmed'] } },
        { sort: { createdAt: -1 } }
      );
      reservationDocs = buildReservationDocs(reservation);
    }

    // Reservation docs first (submitted during onboarding), then user-uploaded docs
    const allDocs = [...reservationDocs, ...uploadedDocs];
    res.json(allDocs);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ detail: 'Failed to get documents' });
  }
}

// Get a single document with file data (for viewing/downloading)
async function getDocumentFile(req, res) {
  try {
    const { docId } = req.params;
    const db = getDb();

    // Reservation documents (ID starts with 'res_')
    if (docId.startsWith('res_')) {
      const user = await db.collection('users').findOne(
        { user_id: req.user.user_id },
        { projection: { _id: 1 } }
      );
      if (!user?._id) {
        return res.status(404).json({ detail: 'Document not found.' });
      }

      const reservation = await db.collection('reservations').findOne(
        { userId: user._id, status: { $in: ['moveIn', 'active', 'completed', 'payment_pending', 'confirmed'] } },
        { sort: { createdAt: -1 } }
      );
      if (!reservation) {
        return res.status(404).json({ detail: 'Document not found.' });
      }

      // Map the doc_id suffix to the reservation field
      const resDocs = buildReservationDocs(reservation);
      const doc = resDocs.find(d => d.doc_id === docId);
      if (!doc) {
        return res.status(404).json({ detail: 'Document not found.' });
      }

      // Return file_url as file_data so the frontend can display it
      return res.json({
        ...doc,
        file_data: doc.file_url,
      });
    }

    // Regular uploaded documents
    const user = await db.collection('users').findOne(
      { user_id: req.user.user_id },
      { projection: { uploaded_documents: 1 } }
    );

    const doc = (user?.uploaded_documents || []).find(d => d.doc_id === docId);
    if (!doc) {
      return res.status(404).json({ detail: 'Document not found.' });
    }

    res.json(doc);
  } catch (error) {
    console.error('Get document file error:', error);
    res.status(500).json({ detail: 'Failed to get document' });
  }
}

// Delete an uploaded document
async function deleteDocument(req, res) {
  try {
    const { docId } = req.params;
    const db = getDb();

    const result = await db.collection('users').updateOne(
      { user_id: req.user.user_id },
      { $pull: { uploaded_documents: { doc_id: docId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ detail: 'Document not found.' });
    }

    res.json({ status: 'deleted', doc_id: docId });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ detail: 'Failed to delete document' });
  }
}

function normalizePushTokenEntry(entry) {
  if (typeof entry === 'string') {
    const token = entry.trim();
    return token
      ? { token, provider: null, platform: null, device_id: null, enabled: true, updated_at: null, last_seen_at: null }
      : null;
  }

  if (!entry || typeof entry !== 'object') return null;

  const token = typeof entry.token === 'string'
    ? entry.token.trim()
    : (typeof entry.push_token === 'string' ? entry.push_token.trim() : '');

  if (!token) return null;

  return {
    token,
    provider: typeof entry.provider === 'string' ? entry.provider.trim().toLowerCase() : null,
    platform: typeof entry.platform === 'string'
      ? entry.platform.trim().toLowerCase()
      : (typeof entry.device_platform === 'string' ? entry.device_platform.trim().toLowerCase() : null),
    device_id: typeof entry.device_id === 'string' && entry.device_id.trim()
      ? entry.device_id.trim()
      : null,
    enabled: entry.enabled !== false,
    updated_at: entry.updated_at || null,
    last_seen_at: entry.last_seen_at || entry.updated_at || null,
  };
}

// Save push notification token
async function savePushToken(req, res) {
  try {
    const rawPushToken = typeof req.body?.push_token === 'string' ? req.body.push_token.trim() : '';
    const notificationsEnabled = req.body?.notifications_enabled !== false;
    const provider = typeof req.body?.provider === 'string' ? req.body.provider.trim().toLowerCase() : null;
    const devicePlatform = typeof req.body?.device_platform === 'string' ? req.body.device_platform.trim().toLowerCase() : null;
    const deviceId = typeof req.body?.device_id === 'string' ? req.body.device_id.trim() : '';
    const replaceLegacyPlatformTokens = req.body?.replace_legacy_platform_tokens === true;
    const db = getDb();
    const now = new Date();

    if (!rawPushToken && notificationsEnabled) {
      return res.status(400).json({ detail: 'push_token is required when notifications are enabled.' });
    }

    if (deviceId && !/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
      return res.status(400).json({ detail: 'device_id must be a stable 16-128 character installation identifier.' });
    }
    if (provider && !['expo', 'fcm', 'apns'].includes(provider)) {
      return res.status(400).json({ detail: 'provider must be expo, fcm, or apns.' });
    }
    if (devicePlatform && !['android', 'ios'].includes(devicePlatform)) {
      return res.status(400).json({ detail: 'device_platform must be android or ios.' });
    }

    // A token or installation belongs to one account at a time. This is
    // essential on shared QA devices and after account switching: otherwise
    // an old account can keep receiving a new tenant's private alerts.
    const otherUserFilter = { user_id: { $ne: req.user.user_id } };
    if (rawPushToken) {
      await Promise.all([
        db.collection('users').updateMany(
          { ...otherUserFilter, push_token: rawPushToken },
          {
            $set: {
              push_token: null,
              push_provider: null,
              push_platform: null,
              push_token_updated: now,
            },
          }
        ),
        db.collection('users').updateMany(
          { ...otherUserFilter, 'push_tokens.token': rawPushToken },
          {
            $pull: { push_tokens: { token: rawPushToken } },
            $set: { push_token_updated: now },
          }
        ),
      ]);
    }
    if (deviceId) {
      await db.collection('users').updateMany(
        { ...otherUserFilter, 'push_tokens.device_id': deviceId },
        {
          $pull: { push_tokens: { device_id: deviceId } },
          $set: { push_token_updated: now },
        }
      );
    }

    const user = await db.collection('users').findOne(
      { user_id: req.user.user_id },
      {
        projection: {
          push_token: 1,
          push_provider: 1,
          push_platform: 1,
          push_token_updated: 1,
          push_tokens: 1,
        },
      }
    );

    const existingEntries = [];
    if (Array.isArray(user?.push_tokens)) {
      existingEntries.push(...user.push_tokens.map(normalizePushTokenEntry));
    }
    if (user?.push_token) {
      existingEntries.push(normalizePushTokenEntry({
        token: user.push_token,
        provider: user.push_provider,
        platform: user.push_platform,
        device_id: null,
        updated_at: user.push_token_updated,
        last_seen_at: user.push_token_updated,
        enabled: true,
      }));
    }

    const filteredEntries = existingEntries
      .filter(Boolean)
      .filter((entry) => entry.token !== rawPushToken)
      .filter((entry) => !deviceId || entry.device_id !== deviceId)
      // Before installation IDs existed, every token refresh appended a new
      // active token. A current client explicitly opts into pruning those
      // indistinguishable legacy registrations for its platform once, which
      // stops one physical device receiving the same event through Expo and
      // FCM while preserving other identified installations.
      .filter((entry) => !(
        deviceId
        && replaceLegacyPlatformTokens
        && !entry.device_id
        && devicePlatform
        && entry.platform === devicePlatform
      ));

    if (rawPushToken) {
      filteredEntries.unshift({
        token: rawPushToken,
        provider,
        platform: devicePlatform,
        device_id: deviceId || null,
        enabled: notificationsEnabled,
        updated_at: now,
        last_seen_at: now,
      });
    }

    const seen = new Set();
    const nextPushTokens = filteredEntries.filter((entry) => {
      if (!entry?.token || seen.has(entry.token)) return false;
      seen.add(entry.token);
      return true;
    });

    const latestEnabledEntry = nextPushTokens.find((entry) => entry.enabled !== false) || null;

    await db.collection('users').updateOne(
      { user_id: req.user.user_id },
      {
        $set: {
          push_tokens: nextPushTokens,
          push_token: latestEnabledEntry?.token || null,
          push_provider: latestEnabledEntry?.provider || null,
          push_platform: latestEnabledEntry?.platform || null,
          push_token_updated: now,
        },
      }
    );

    res.json({
      status: 'ok',
      notifications_enabled: notificationsEnabled,
      token_saved: Boolean(rawPushToken && notificationsEnabled),
      installation_registered: Boolean(deviceId),
    });
  } catch (error) {
    console.error('Save push token error:', error);
    res.status(500).json({ detail: 'Failed to save push token' });
  }
}

module.exports = {
  getMe,
  updateMe,
  markTenantOnboardingSeen,
  savePushToken,
  uploadDocument,
  getUserDocuments,
  getDocumentFile,
  deleteDocument,
  sanitizeUserForClient,
  resolveTenantBranchLocation,
  buildCanonicalUserProfile,
  normalizeUser,
};
