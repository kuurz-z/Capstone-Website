---
description: Run automated tests for backend and frontend
---

# Run Tests

Runs the automated test suites for both the Express backend and the React frontend.

## How to Run

**Option 1 — Ask the AI:** Type `/run-tests` in chat

**Option 2 — Run manually:** Open **two** terminals:

**Terminal 1 (Backend tests):**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server
npm test
```

**Terminal 2 (Frontend tests):**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web
npm test
```

## Expected Output
- Backend: `Tests X passed` (schemas, middleware, integration tests)
- Frontend: `Tests X passed` (component tests)

// turbo-all

1. Run backend tests:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\server && npm test
```

2. Run frontend tests:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website\web && npm test
```

3. Confirm all tests pass by checking the terminal output for green checkmarks.
