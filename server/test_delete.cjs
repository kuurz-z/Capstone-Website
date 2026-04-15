const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/lilycrest-dormitory').then(async () => {
    try {
        const users = await mongoose.connection.db.collection('users').find({
            email: { $regex: 'kurochan|remedios', $options: 'i' }
        }).toArray();
        console.log(Found  users);
        for (const u of users) {
            const res = await mongoose.connection.db.collection('reservations').find({ user: u._id }).toArray();
            const bills = await mongoose.connection.db.collection('bills').find({ user: u._id }).toArray();
            const payments = await mongoose.connection.db.collection('payments').find({ user: u._id }).toArray();
            console.log('User: ' + u.email + ' (Archived: ' + u.isArchived + ')');
            console.log('Reservations: ' + res.length + ' - Statuses: ' + res.map(r => r.status).join(', '));
            console.log('Bills: ' + bills.length + ' - Statuses: ' + bills.map(b => b.status).join(', '));
            console.log('Payments: ' + payments.length + ' - Statuses: ' + payments.map(p => p.status).join(', '));
        }
    } catch (e) { console.error(e); }
    process.exit(0);
});
