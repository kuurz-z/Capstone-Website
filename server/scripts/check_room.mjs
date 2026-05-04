import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Room from '../models/Room.js';
import Reservation from '../models/Reservation.js';

await mongoose.connect(process.env.MONGODB_URI);

const room = await Room.findOne({ roomNumber: 'GP-Q-003' }).lean();
if (!room) { console.log('Room not found'); process.exit(1); }

console.log('Room ID:', room._id.toString());
console.log('currentOccupancy:', room.currentOccupancy);
console.log('\nBeds:');
room.beds.forEach(b => {
  console.log(`  ${b.label || b.bedNumber} | status: ${b.status} | occupiedBy:`, JSON.stringify(b.occupiedBy));
});

const res = await Reservation.find({
  roomId: room._id,
  status: { $in: ['moveIn', 'reserved', 'pending'] }
}).lean();

console.log('\nActive reservations:', res.length);
res.forEach(r => console.log('  -', r._id.toString(), '| status:', r.status, '| bed:', r.selectedBed));

await mongoose.disconnect();
