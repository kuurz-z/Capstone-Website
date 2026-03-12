---
description: Check database state using utility scripts
---

# Check Database State

Runs utility scripts to inspect the current MongoDB database state.

## How to Run

**Option 1 — Ask the AI:** Type `/check-db` in chat

**Option 2 — Run manually:**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server
node check-users.js
```

## What it Shows
- Lists all users in the database with their email, role, and branch

// turbo-all

1. Check current users in the database:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server && node check-users.js
```

2. Report the output to the user, summarizing the relevant data found.

## Optional Actions

If the user needs additional data inspection, write a temporary script in `/tmp/` that connects to the database using the existing Mongoose config and queries the required collection.
