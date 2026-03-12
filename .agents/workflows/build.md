---
description: Build production bundles for tenant and admin frontends
---

# Production Build

Builds both the tenant-facing and admin-facing frontends for deployment.

## How to Run

**Option 1 — Ask the AI:** Type `/build` in chat

**Option 2 — Run manually:**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web

# Build tenant frontend
npm run build

# Build admin frontend
npm run build:admin
```

## Expected Output
- Build output in `web/build/` directory
- Terminal shows `✓ built in X.XXs` with no errors

// turbo-all

1. Build the tenant frontend:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web && npm run build
```

2. Build the admin frontend:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web && npm run build:admin
```

3. Verify the builds completed successfully.
