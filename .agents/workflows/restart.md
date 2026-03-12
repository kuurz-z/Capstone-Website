---
description: Kill stuck port and restart the backend server
---

# Kill Port & Restart Server

This workflow kills any process on the server port and restarts the backend with nodemon.

// turbo-all

1. Kill any process occupying the server port and restart:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server && npm run restart
```

2. Confirm the server restarted successfully by checking terminal output for `Server running on port ...`.
