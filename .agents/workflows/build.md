---
description: Build production bundles for tenant and admin frontends
---

# Production Build

This workflow builds both the tenant-facing and admin-facing frontends for deployment.

// turbo-all

1. Build the tenant frontend:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web && npm run build
```

2. Build the admin frontend:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web && npm run build:admin
```

3. Verify the builds completed successfully:
   - Check for build output in `web/build/` directory
   - Ensure there are no build errors in the terminal output
