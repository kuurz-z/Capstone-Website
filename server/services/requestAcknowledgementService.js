import mongoose from 'mongoose';
import TenantTransferRequest from '../models/TenantTransferRequest.js';
import StayExtensionRequest from '../models/StayExtensionRequest.js';
import { isAdminRole, isOwnerRole } from '../config/roles.js';
import { notify } from './notifications/notificationService.js';

export async function acknowledgeTenancyRequest({ kind, requestId, actor }) {
  if (!mongoose.isValidObjectId(requestId)) throw Object.assign(new Error('Invalid request ID.'), { statusCode: 400 });
  const Model = kind === 'transfer' ? TenantTransferRequest : StayExtensionRequest;
  const scope = { _id: requestId, ...(isOwnerRole(actor?.role) ? {} : { branch: actor?.branch || '__none__' }) };
  if (!isAdminRole(actor?.role)) throw Object.assign(new Error('Admin access required.'), { statusCode: 403 });
  let request = await Model.findOneAndUpdate({ ...scope, acknowledgedAt: null },
    { $set: { acknowledgedAt: new Date(), acknowledgedBy: actor._id } }, { new: true });
  request ||= await Model.findOne(scope);
  if (!request) throw Object.assign(new Error('Request not found for your branch.'), { statusCode: 404 });
  await notifyRequestAcknowledgement(request, kind);
  return request;
}

export async function notifyRequestAcknowledgement(request, kind) {
  const title = kind === 'transfer' ? 'Room Transfer Request Reviewed' : 'Stay Extension Reviewed';
  const deliver = kind === "transfer" ? notify.roomTransferLifecycleOnce : notify.stayExtensionLifecycleOnce;
  await deliver(request.tenantId, title,
    'Admin has reviewed your request. This acknowledgement is not an approval or effective tenancy change.',
    `tenancy_request_acknowledged:${kind}:${request._id}`, {
      entityType: 'reservation', entityId: request.reservationId,
      actionUrl: kind === 'transfer' ? '/room-transfer' : '/extend-stay',
      data: { screen: kind === 'transfer' ? 'room-transfer' : 'extend-stay', event: 'acknowledged' },
    });
}
