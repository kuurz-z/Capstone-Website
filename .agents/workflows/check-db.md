---
description: Check database state using utility scripts
---

# Check Database State

This workflow runs utility scripts to inspect the current state of the MongoDB database.

// turbo-all

1. Check current users in the database:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server && node check-users.js
```

2. Report the output to the user, summarizing the relevant data found.

## Optional Actions

If the user needs additional data inspection, write a temporary script in `/tmp/` that connects to the database using the existing Mongoose config and queries the required collection. For example:

```javascript
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'D:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/.env' });

await mongoose.connect(process.env.MONGODB_URI);
const data = await mongoose.connection.db.collection('<collection_name>').find({}).limit(10).toArray();
console.log(JSON.stringify(data, null, 2));
await mongoose.disconnect();
```
