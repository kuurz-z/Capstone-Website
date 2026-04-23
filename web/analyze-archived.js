const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/lilycrest-dormitory');
  const User = require('./models/User.js').default;
  const Reservation = require('./models/Reservation.js').default;
  const Bill = require('./models/Bill.js').default;

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
