# Implementation Roadmap

## Phase 1: Routing Consolidation

Goal: make the app routing layer predictable and reduce drift between old and new route definitions.

Steps:
1. Treat `web/src/app/routes/*` as the canonical route map.
2. Normalize entry routes such as `/admin` and `/applicant`.
3. Preserve legacy redirects in one place only.
4. Verify that public, applicant, admin, and owner paths still resolve correctly.

Success criteria:
- Canonical routes are defined in `web/src/app/routes`.
- Entry paths redirect to their intended dashboards/pages.
- Legacy paths still resolve without breaking bookmarks.

## Phase 2: Guard and Auth Normalization

Goal: make route access rules consistent across `ProtectedRoute` and the specialized guards.

Steps:
1. Align role semantics for applicant, tenant, branch admin, and owner.
2. Remove overlapping redirect logic between guards where possible.
3. Standardize unauthenticated redirects and loading behavior.
4. Verify role access against the main protected flows.

Success criteria:
- Each role has one clear redirect rule per route group.
- Admin and non-admin sessions cannot leak into the wrong route tree.

## Phase 3: Route Structure Cleanup

Goal: remove dead routing code and finalize the app-shell structure.

Steps:
1. Simplify `web/src/App.js` to provider setup plus the canonical route layer.
2. Remove obsolete route declarations and unused lazy imports.
3. Keep error boundaries and suspense behavior intact.

Success criteria:
- `App.js` is thin and only composes providers plus `AppRoutes`.
- No duplicate route trees remain in source.

## Phase 4: Documentation Sync

Goal: align architecture and auth docs with the actual codebase.

Steps:
1. Update structure/auth/security docs after routing and guard changes settle.
2. Document canonical route ownership and legacy redirect strategy.

Success criteria:
- Docs describe the current route and auth architecture accurately.

## Phase 5: Verification and Hardening

Goal: confirm the refactor did not regress navigation or authorization.

Steps:
1. Run targeted frontend build/test checks.
2. Manually validate key route flows for public, applicant, admin, and owner users.
3. Fix any broken imports, redirects, or guard regressions.

Success criteria:
- Frontend builds successfully.
- Core route flows are valid.
