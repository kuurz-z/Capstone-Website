const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/lilycrest-dormitory').then(async () => {
    try {
        const users = await mongoose.connection.db.collection('users').find({
            email: { \$regex: 'kurochan|remedios', \$options: 'i' }
        }).toArray();
        for (const u of users) {
             console.log(u.email + ' -> ' + u.isArchived);
        }
    } catch (e) { console.error(e); }
    process.exit(0);
});
