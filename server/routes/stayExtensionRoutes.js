import express from 'express';
import mongoose from 'mongoose';
import { mobileTenantAuth } from '../middleware/mobileTenantAuth.js';
import { verifyToken, verifyAdmin } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/permissions.js';
import { isOwnerRole } from '../config/roles.js';
import StayExtensionRequest from '../models/StayExtensionRequest.js';
import { createStayExtension, getMyStayExtension, reviewStayExtension } from '../services/stayExtensionRequestService.js';

const wrap = (handler) => async (req, res) => {
  try { res.setHeader('Cache-Control', 'private, no-store'); await handler(req, res); }
  catch (error) { res.status(error.statusCode || 500).json({ detail: error.statusCode ? error.message : 'Unable to process stay extension.', error: error.statusCode ? error.message : 'Unable to process stay extension.' }); }
};
export const mobileStayExtensionRoutes = express.Router();
mobileStayExtensionRoutes.get('/stay-extension/current', mobileTenantAuth, wrap(async (req, res) => {
  res.json(await getMyStayExtension(req.mobileTenant._id));
}));
mobileStayExtensionRoutes.post('/stay-extension-requests', mobileTenantAuth, wrap(async (req, res) => {
  res.status(201).json(await createStayExtension({ tenantId: req.mobileTenant._id, payload: req.body }));
}));

export const adminStayExtensionRoutes = express.Router();
const guards = [verifyToken, verifyAdmin, requireAnyPermission(['manageReservations', 'manageTenants'])];
adminStayExtensionRoutes.get('/stay-extension-requests', ...guards, wrap(async (req, res) => {
  const filter = isOwnerRole(req.authUser.role) ? {} : { branch: req.authUser.branch || '__none__' };
  const requests = await StayExtensionRequest.find(filter).sort({ createdAt: -1 }).limit(100)
    .populate('tenantId', 'firstName lastName email').populate('roomId', 'name roomNumber').lean();
  res.json({ requests });
}));
adminStayExtensionRoutes.patch('/stay-extension-requests/:id', ...guards, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' });
  res.json(await reviewStayExtension({ requestId: req.params.id, actor: req.authUser, decision: req.body.decision, adminNote: req.body.adminNote }));
}));
