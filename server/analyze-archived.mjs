import mongoose from 'mongoose';
import User from './models/User.js';
import Reservation from './models/Reservation.js';
import Bill from './models/Bill.js';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/lilycrest-dormitory');
  const archivedUsers = await User.find({ isArchived: true });
  console.log('Found ' + archivedUsers.length + ' archived users.');

  for (const user of archivedUsers) {
    const reservations = await Reservation.find({ userId: user._id });
    const bills = await Bill.find({ userId: user._id });
    
    console.log('');
    console.log('User: ' + user.firstName + ' ' + user.lastName + ' (' + user.email + ')');
    console.log('  Reservations: ' + reservations.length);
    reservations.forEach(r => console.log('    - ID: ' + r._id + ', Status: ' + r.status));
    console.log('  Bills: ' + bills.length);
    bills.forEach(b => console.log('    - ID: ' + b._id + ', Status: ' + b.status + ', Amount: ' + b.amount));
  }
  process.exit(0);
}
run();
