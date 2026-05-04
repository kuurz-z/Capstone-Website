import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Room from '../models/Room.js';

await mongoose.connect(process.env.MONGODB_URI);

const room = await Room.findOne({ roomNumber: 'GP-Q-003' });
if (!room) { console.log('Room not found'); process.exit(1); }

const staleReservationId = '69b5ae11d8ee5d38180210c1';

let fixed = 0;
for (const bed of room.beds) {
  if (
    bed.status === 'occupied' &&
    bed.occupiedBy?.reservationId?.toString() === staleReservationId
  ) {
    console.log(`Fixing bed (label: ${bed.label || bed.bedNumber}, id: ${bed._id})`);
    bed.status = 'available';
    bed.occupiedBy = { userId: null, reservationId: null, occupiedSince: null };
    fixed++;
  }
}

if (fixed > 0) {
  // Also reconcile currentOccupancy
  room.currentOccupancy = room.beds.filter(b => b.status === 'occupied').length;
  await room.save();
  console.log(`✅ Fixed ${fixed} orphaned bed(s). currentOccupancy now: ${room.currentOccupancy}`);
} else {
  console.log('No orphaned beds found with that reservationId.');
}

await mongoose.disconnect();
