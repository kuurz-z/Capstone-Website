# Senior Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the 3 Important issues and 1 Minor issue identified during the Senior Code Review across image optimization proxy security, React progressive image fallback state management, and standardized reservation heartbeat API contracts.

**Architecture:** 
1. Harden the Express Sharp proxy ([`imageOptimizationController.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/imageOptimizationController.js)) with `Content-Length` (15MB ceiling), `Content-Type` validation, bucket-level pathname verification, and normalized cache key generation.
2. Refactor [`ProgressiveImage.jsx`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/shared/components/ProgressiveImage.jsx) to manage image source transitions through declarative React state (`currentSrc`), eliminating virtual DOM attribute overrides when fallback images finish loading.
3. Standardize the pending reservation heartbeat endpoint ([`reservationLifecycleController.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/reservations/reservationLifecycleController.js)) to return the uniform `{ success: true, data: ... }` contract while providing backward-compatible top-level properties and structured `AppError` handling.

**Tech Stack:** Express.js, Sharp, Node.js, React 19, Vite, Jest, Day.js.

---

## Global Constraints

- **Solid Colors & Strictly No Gradients**: Preserve all solid neutral surfaces (`1px solid var(--border)` / `bg-slate-100 dark:bg-slate-800`), transparent badge backgrounds with colored status dots, and zero decorative gradients.
- **Terminology Invariants**: Maintain strict terminology: "Tenant" (never "Resident"), "Assistant" (never "Copilot"), "Owner" (never "Super Admin"), and "Rent" (never "Rental Fee").
- **Contract Parity**: Enforce uniform API response envelopes (`{ success: true, data: ... }`) without breaking mobile API clients or existing tests.
- **Zero Data Loss**: Image optimization proxy remains non-destructive, reading remote sources without altering Firebase storage assets.
- **Quality Gate**: Every task must end with verified automated test suites (`npm test` and component tests).

---

## What to Expect from These Changes

| Component / Flow | Current Behavior | Anticipated Outcome After Remediation |
| :--- | :--- | :--- |
| **Image Optimization Proxy** | Buffers unbounded remote files into server memory; allows any Google Storage bucket | Rejects remote assets > 15MB, enforces `image/*` MIME type, restricts URLs to authorized project buckets in production, and standardizes cache keys |
| **Progressive Image Fallback** | Imperative DOM edit (`imgRef.current.src = fallback`) is overridden on re-render by virtual DOM reconciliation | Declarative React state (`currentSrc`) safely swaps failed proxy URLs with raw storage URLs without re-render clobbering |
| **Reservation Activity Heartbeat** | Returns flat properties `{ success: true, code: ..., renewedAt: ... }` | Returns standard `{ success: true, data: { code, renewedAt, expiresAt } }` payload with backward-compatible top-level alias, unblocking standard `httpClient.js` unwrap |

---

## User Review Required

> [!NOTE]
> All changes are non-destructive and backward-compatible. Top-level property aliases are preserved alongside the new `data` envelope on the heartbeat endpoint to ensure zero disruption to any in-flight mobile or web clients.

---

## Proposed Changes

### Component 1: Server Image Optimization Security & Cache Normalization

#### [MODIFY] [`imageOptimizationController.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/imageOptimizationController.js)
- Import `resolveFirebaseStorageBucket` from `../config/firebase.js`.
- In `validateImageUrl(rawUrl)`:
  - Verify that URL pathname is non-empty, does not contain path traversal (`..`), and targets a valid resource.
  - In production (`process.env.NODE_ENV === "production"`), verify that the URL targets the application's resolved Firebase bucket.
- In `optimizeRoomPhoto`:
  - Normalize origin URL *before* computing the MD5 cache key: `const normalizedUrl = normalizeOriginImageUrl(rawUrl); const cacheKey = getCacheKey(normalizedUrl, width, quality, format);`.
  - In remote origin fetch:
    - Inspect `originResponse.headers.get("content-length")`; if > 15MB (`15 * 1024 * 1024`), throw `AppError("Image exceeds maximum allowed size (15MB)", 413, "IMAGE_TOO_LARGE")`.
    - Inspect `originResponse.headers.get("content-type")`; if present and neither starts with `image/` nor equals `application/octet-stream`, throw `AppError("Remote asset is not a valid image", 415, "UNSUPPORTED_MEDIA_TYPE")`.
    - After `await originResponse.arrayBuffer()`, assert `arrayBuffer.byteLength <= 15 * 1024 * 1024` as a secondary safeguard.

#### [MODIFY] [`imageOptimizationController.test.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/imageOptimizationController.test.js)
- Add unit tests verifying:
  - Rejection of origin assets exceeding 15MB (status 413).
  - Rejection of origin assets with non-image Content-Type like `application/pdf` or `text/html` (status 415).
  - Identical MD5 cache key generated for URLs whether or not `alt=media` is pre-appended.

---

### Component 2: Client Progressive Image Declarative State

#### [MODIFY] [`ProgressiveImage.jsx`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/web/src/shared/components/ProgressiveImage.jsx)
- Introduce `const [currentSrc, setCurrentSrc] = useState(optimizedSrc);`.
- Use `useEffect` to synchronize `currentSrc` when `optimizedSrc` changes (e.g. when card props change):
  ```javascript
  useEffect(() => {
    setCurrentSrc(optimizedSrc);
    setStatus("loading");
    hasRetriedRef.current = false;
  }, [optimizedSrc]);
  ```
- In `handleError`:
  - Check `!hasRetriedRef.current && currentSrc && currentSrc.includes("/api/rooms/photos/optimize")`.
  - If a fallback exists and differs from `currentSrc`, update `setCurrentSrc(fallback)` instead of touching `imgRef.current.src`.
  - If retry already occurred or no fallback exists, call `setStatus("error")`.
- In JSX: render `<img ref={imgRef} src={currentSrc} ... />`.

---

### Component 3: Server Reservation Heartbeat Standardized Envelope

#### [MODIFY] [`reservationLifecycleController.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/reservations/reservationLifecycleController.js)
- In `touchReservationActivity`:
  - Use `throw new AppError(...)` for invalid state / missing entities instead of ad-hoc JSON errors.
  - Return standardized response envelope:
    ```javascript
    return res.status(200).json({
      success: true,
      code: "RESERVATION_HEARTBEAT_RECORDED",
      data: {
        code: "RESERVATION_HEARTBEAT_RECORDED",
        renewedAt: reservation.updatedAt,
        expiresAt: dayjs(reservation.updatedAt).add(30, "minute").toDate(),
      },
      renewedAt: reservation.updatedAt,
      expiresAt: dayjs(reservation.updatedAt).add(30, "minute").toDate(),
    });
    ```

#### [MODIFY] [`reservationLifecycleController.heartbeat.test.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/reservations/reservationLifecycleController.heartbeat.test.js)
- Update/add test assertions verifying:
  - Response contains `{ success: true, data: { code: "RESERVATION_HEARTBEAT_RECORDED", ... } }`.
  - Missing reservation throws or returns 404 with structured error envelope.

---

## Detailed Task Breakdown

### Task 1: Harden Image Optimization Proxy (Payload Guard, Bucket Check & Cache Key)
- [ ] **Step 1.1: Add failing unit tests** in [`imageOptimizationController.test.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/imageOptimizationController.test.js) for 15MB payload rejection, non-image Content-Type rejection, and cache key normalization.
- [ ] **Step 1.2: Run test to confirm failure**: `npm test server/controllers/imageOptimizationController.test.js`.
- [ ] **Step 1.3: Implement security checks and pre-normalization** in [`imageOptimizationController.js`](file:///d:/Portfolio/3rdYear/CapstoneSystem/Capstone-Website/server/controllers/imageOptimizationController.js).
- [ ] **Step 1.4: Run test to confirm pass**: `npm test server/controllers/imageOptimizationController.test.js`.

### Task 2: Declarative React Fallback State in ProgressiveImage
- [ ] **Step 2.1: Add unit test in client test suite** simulating image load error and verifying that component state updates to the fallback URL rather than throwing or reverting.
- [ ] **Step 2.2: Refactor `ProgressiveImage.jsx`** to use `currentSrc` state with `useEffect` synchronization.
- [ ] **Step 2.3: Run web tests and build**: `npm run build` in `web/` to confirm zero regressions.

### Task 3: Standardize Reservation Heartbeat Response Envelope
- [ ] **Step 3.1: Add test in `reservationLifecycleController.heartbeat.test.js`** verifying the `{ success: true, data: ... }` envelope structure.
- [ ] **Step 3.2: Update `touchReservationActivity`** in `reservationLifecycleController.js` to wrap payload in `data` and throw standard `AppError`s.
- [ ] **Step 3.3: Run test**: `npm test server/controllers/reservations/reservationLifecycleController.heartbeat.test.js` and `npm test server/controllers/reservationsController.access.test.js`.

---

## Verification Plan

### Automated Tests
- Run image controller test suite:
  ```powershell
  npm test -- server/controllers/imageOptimizationController.test.js
  ```
- Run heartbeat test suites:
  ```powershell
  npm test -- server/controllers/reservations/reservationLifecycleController.heartbeat.test.js
  npm test -- server/controllers/reservationsController.access.test.js
  ```
- Run client component verification & production build:
  ```powershell
  cd web && npm run build
  ```

### Manual Verification
- Verify room photo thumbnail loading and fallback display when an invalid image parameter is supplied.
- Verify heartbeat network request in browser dev tools on `/applicant/reservation-flow` confirming `{ success: true, data: { code: ... } }`.
