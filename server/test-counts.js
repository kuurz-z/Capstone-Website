import { User } from './models/index.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const allUsers = await User.find({}, 'isArchived role accountStatus branch').lean();
  console.log('Total:', allUsers.length);
  const byArchive = { true: 0, false: 0, undefined: 0 };
  allUsers.forEach(u => {
    let k = u.isArchived;
    if (k === undefined) k = 'undefined';
    byArchive[k] = (byArchive[k] || 0) + 1;
  });
  console.log('byArchive:', byArchive);
  process.exit(0);
}
run();