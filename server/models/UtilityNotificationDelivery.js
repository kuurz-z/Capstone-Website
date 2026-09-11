import mongoose from 'mongoose';

// Created in the publication transaction. No TTL: completion must survive
// notification-feed retention and later retries of the original billing event.
const schema = new mongoose.Schema({
  _id: String,
  billId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  utilityType: { type: String, enum: ['water', 'electricity'], required: true },
  periodId: { type: mongoose.Schema.Types.ObjectId, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  notificationId: mongoose.Schema.Types.ObjectId,
  notificationStatus: { type: String, default: 'pending' },
  push: { type: mongoose.Schema.Types.Mixed, default: () => ({ status: 'pending', attempted: false, accepted: 0 }) },
  acceptedTokenHashes: { type: [String], default: [] },
  attempts: { type: Number, default: 0 },
  leaseToken: String,
  leaseUntil: Date,
  error: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.UtilityNotificationDelivery || mongoose.model('UtilityNotificationDelivery', schema);
