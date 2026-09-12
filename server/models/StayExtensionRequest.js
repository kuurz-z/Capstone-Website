import mongoose from 'mongoose';

// A review request, never an alternative source of Stay/Contract terms.
const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true },
  stayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay', required: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contract', required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  branch: { type: String, required: true },
  currentStartDate: { type: Date, required: true },
  currentEndDate: { type: Date, required: true },
  requestedEndDate: { type: Date, required: true },
  months: { type: Number, required: true, min: 1, max: 24 },
  monthlyRent: { type: Number, required: true },
  reason: { type: String, maxlength: 500, default: '' },
  note: { type: String, maxlength: 1000, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote: { type: String, maxlength: 1000, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  successorStayId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stay' },
}, { timestamps: true });
schema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
schema.index({ branch: 1, status: 1, createdAt: -1 });
export default mongoose.model('StayExtensionRequest', schema);
