# Admin support ratings implementation — 2026-09-27

## A. Existing Admin Implementation

Audited before editing:

- `web/src/features/admin/pages/AdminChatPage.jsx`: support workspace and modal/composer wiring.
- `web/src/features/admin/components/chat/useAdminChat.js`: queue, messages, replies, assignment, status/priority/close, polling and sockets.
- `AdminChatConversationList.jsx`: filters, conversation references and grouping; it suppressed additional active concerns for the same tenant.
- `AdminChatTicketSidebar.jsx`, `AdminChatStatusModal.jsx`, `AdminChatCloseModal.jsx`, `AdminChatClosedBanner.jsx`, `chatConstants.js`: conversation lifecycle controls and descriptions. Resolve was excluded from selectable statuses.
- `web/src/shared/api/chatApi.js`: authenticated conversation-addressed endpoints; status already accepted a note but the UI did not supply a resolution note.
- `web/src/shared/hooks/useChatSocket.js`, `web/src/shared/components/NotificationBell.jsx`, `web/src/features/admin/pages/AdminNotificationsPage.jsx`: event handling and notification navigation.
- `server/models/ChatConversation.js`, `server/controllers/chatController.js`, `server/routes/chatRoutes.js`: conversation-only schema/controller, branch/owner authorization, admin resolution rejection, tenant resolution and legacy automatic closure.
- `server/controllers/analyticsController.js`, `web/src/features/admin/pages/AnalyticsSupportChatTab.jsx`: existing conversation-level satisfaction reporting.

Authoritative reference read without modification: `D:/LilyCrest/LilyCrest-Clean/backend/services/supportRequest.service.js`, `backend/controllers/chat.controller.js`, `backend/tests/supportRequestIntegration.test.js`, and `docs/LILIORA_CHATBOT_REMEDIATION_2026-09-27.md`.

## B. Compatibility Problems Found

The admin used thread identity for concern presentation, read top-level lifecycle values, offered administrative closure instead of explicit request resolution, and did not display saved satisfaction. Socket/fetch responses could replace newer state without checking revision. Multiple active concerns for one tenant were hidden. Existing CSAT reporting could mix historical conversation ratings with new request ratings.

The reference backend stores an embedded request but its current HTTP serializer emits a **flat authoritative projection** with `requestId`, `legacy`, `satisfaction` and `revision`; it does not currently emit the entire embedded request. This was verified against source and exercised in the contract test. The admin accepts that real projection as well as embedded requests. Capstone's updated serializer returns both.

## C. Admin Changes Applied

- Added `web/src/shared/utils/supportConcern.js`: shared normalization, identity validation, revision reconciliation, allowed transitions, targeted status payloads and support notification URLs.
- Added `AdminSupportRequestDetails.jsx`: lifecycle details separate from messages, saved stars/score/feedback/submission date, pending and unavailable states, and historical labeling.
- Updated the audited chat components, hook and API wrapper: separate concerns, request references, assigned-admin labels, rating badges, explicit Resolve with note, immutable rated controls, refresh on open/focus/visibility/poll/manual action, stale response protection and 409 reconciliation. Delayed message responses cannot replace a different selected thread.
- Updated notification navigation and socket forwarding to retain both identities. Exact request/thread query filters are supported. Unrelated maintenance notifications retain their existing routing.
- Added `server/services/supportRequestService.js`, adapted from the authoritative service's transition, compare-and-set and pending-message recovery implementation. Its notification adapter uses Capstone's existing transport. No dependency on the other checkout is introduced into production code.
- Updated `ChatConversation.js` and `chatController.js` to read embedded requests, expose revision, perform targeted request-aware admin actions, preserve request identity in message responses, authorize branch or explicit request assignment, and exclude new requests from the legacy auto-close job. Legacy actions remain on their existing path.
- Updated `server/services/notifications/notificationService.js` to carry support request identity and event text through the existing inbox/push path. Pending support delivery is retained if persistence fails and is reconciled on support reads or by the existing mobile reconciliation process.
- Updated existing support analytics: request CSAT and historical conversation CSAT are separate cohorts; invalid request associations are excluded. No maintenance rating integration was added.
- Added normalization/component/contract tests and updated affected legacy assertions in `AdminChatPhase4.test.mjs`, `chatController.authority.test.js` and `analyticsController.test.js`.

## D. Rating Data Mapping

| Backend field | Normalized admin field | UI location |
| --- | --- | --- |
| Conversation `id` / `_id` | `conversationId`; retained `id` alias | Thread loading, replies and routing |
| `request.id` (or verified flat `requestId`) | `requestId` | Queue reference, support details, status payload, notification target |
| Request lifecycle fields | `status`, `concern`, `category`, `priority`, assignment, dates | Queue filters/cards and request details |
| `request.closingNote` | `resolutionNote` | Resolution note |
| `request.satisfaction.requestId` | Association validation | Mismatch logs identity metadata and displays unavailable state |
| `request.satisfaction.rating` | `rating` | Read-only stars and score; queue badge |
| `request.satisfaction.feedback` | `feedback` | Tenant Satisfaction feedback |
| `request.satisfaction.submittedAt` | `ratedAt` | Submitted date/time |
| `supportRevision` / `revision` | `revision` | Fetch reconciliation and status concurrency check |

Embedded request values take precedence, including null/unrated fields. New request satisfaction is completed only for resolved state, a matching request ID and a valid saved integer score. A flat compatibility rating alone is not treated as completed new-request satisfaction.

## E. Resolution Integration

Admin selects an allowed status. Resolve requires a trimmed, nonblank note of at most 1,000 characters. Submission is disabled while pending. The existing `PATCH /chat/admin/conversations/:conversationId/status` receives only status, note, request ID and revision. The thread ID remains the route address; the request ID validates the concern association.

For embedded requests the server follows the reference transition table: open can enter review/waiting/closed; review and waiting can resolve; unrated resolved requests can return to review or close; closed is terminal; rated requests reject lifecycle changes. Resolution records the acting admin, date and note atomically with the embedded request/projection update. Replies can enter waiting state and do not resolve concerns. A stale revision returns 409 and the UI refreshes authoritative state with an explanation.

## F. Legacy Behavior

No historical request IDs are fabricated. Legacy conversation ratings retain their historical meaning and are labeled accordingly. Legacy threads are not split or migrated. Historical satisfaction is excluded from new request CSAT averages. No mobile files, production data or maintenance rating model were changed.

## G. Tests

From `D:/Capstone-Website/server` — **49 passed, 5 suites**:

```text
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --roots controllers routes services --runTestsByPath controllers/chatSupportContract.integration.test.js controllers/chatController.authority.test.js controllers/analyticsController.test.js routes/chatRoutes.authorization.test.js services/notifications/phase2CanonicalEventCoverage.integration.test.js
```

From `D:/Capstone-Website` — **25 passed**:

```text
node --test web/src/shared/utils/supportConcern.test.mjs web/src/features/admin/components/chat/supportRating.behavior.test.mjs web/src/features/admin/pages/AdminChatPhase4.test.mjs web/src/features/admin/components/chat/AdminChatFilterOptimization.test.mjs
```

Total: **74 targeted tests passed**. Component tests execute rendered React components and the chat hook in JSDOM. Coverage includes active/unrated/rated/mismatched/legacy data, independent same-tenant concerns, read-only UI, disabled rated controls, note validation, focus refresh, overlapping reads, stale revisions, 409 reconciliation, backend transitions and authorization.

Admin production build passed from `web` using:

```text
node --input-type=module -e "import { build } from 'vite'; await build({configFile:'vite.admin.config.js',build:{rollupOptions:{maxParallelFileOps:20}}});"
```

The default admin build initially hit Windows `EMFILE`; reducing file-operation concurrency succeeded without changing build configuration. Existing chunk-size/circular-chunk and Browserslist warnings remain. Subsequent small UI changes were exercised by the final component run. Task-scoped diff whitespace checks passed.

## H. Mobile-to-Admin Contract Verification

**PASS.** `chatSupportContract.integration.test.js` executes the actual reference mobile controller against isolated local MongoDB, together with Capstone's real admin controller and web normalizer. Database access is injected; notification delivery is mocked. The reference checkout defaults to the path above and can be overridden with `LILIORA_BACKEND_ROOT`.

Verified sequence: mobile creates A → Capstone reviews/replies → Capstone resolves with note → mobile saves 5/5 with feedback → Capstone refetches details and queue → admin normalization retains A's identity, resolution, feedback and submission time → lifecycle mutations are rejected → mobile creates B, open and unrated → A remains resolved/rated.

Also verified mismatched request IDs, stale mutations, legacy history, cross-branch denial, explicit assignment access, and stale compatibility projections. This is local controller/database/UI verification, not a physical-device, live push or deployed browser round trip.

## I. Remaining External Blockers

- A concurrent merge introduced unrelated unresolved conflict markers in `server/controllers/roomsController.js` during this task. That file was not edited here. Whole-repository release readiness requires completing that merge; task-scoped checks are separate from the full repository check.
- Deployment and the authenticated physical-mobile/deployed-admin round trip were not exercised. Existing shared-database configuration, remediation indexes and running delivery/reconciliation services must be present in the target environment. No deployment, index migration, production write or release build was performed.

## J. Final Verdict

**PASS WITH EXTERNAL LIMITATIONS.** The local mobile-save → backend-return → same-request admin mapping/display contract passes, and subsequent concerns remain independent. Physical delivery and deployed behavior are not claimed verified; the unrelated concurrent merge remains outside this implementation.
