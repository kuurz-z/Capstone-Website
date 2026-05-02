# AI-Assisted Billing Intelligence Plan

## Summary

Implement **Admin Utility Billing AI Intelligence** for the billing module. Gemini will explain existing electricity validation, anomaly, and forecast results, while deterministic billing rules remain the source of truth.

The AI is **explain-only**. It can summarize risks and recommend admin actions, but it cannot block, approve, edit, or send bills.

## Goals

- Add AI-assisted explanations to the admin electricity billing workflow.
- Help admins understand unusual electricity usage, missing readings, allocation warnings, and open-period forecasts.
- Reuse the existing Gemini configuration already available in the server environment.
- Keep billing math deterministic, auditable, and unchanged.
- Keep the existing fallback behavior so the feature still works when Gemini is unavailable.

## Current System Anchors

- Electricity validation, anomaly review, and forecast logic already exist in `server/utils/electricityReviewRules.js`.
- Utility diagnostics already attach `electricityReview` data for electricity rooms.
- Gemini provider infrastructure already exists for analytics insights.
- The admin utility billing interface is centered on `UtilityBillingTab`.

## Step-by-Step Implementation

### 1. Reuse Existing Gemini Setup

Use the existing environment configuration:

```env
AI_INSIGHTS_PROVIDER=gemini
GOOGLE_AI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash-lite
```

Implementation notes:

- Reuse `GOOGLE_AI_API_KEY`.
- Keep `GEMINI_API_KEY` support optional if already supported by shared AI code.
- Do not add another API key just for billing.
- Keep heuristic fallback for reliability.

### 2. Add Backend Billing AI Service

Create a new service:

```text
server/services/billingIntelligenceService.js
```

The service should:

- Accept a compact billing snapshot.
- Call Gemini when configured.
- Return fallback insight when Gemini fails.
- Validate and normalize AI output before returning it.
- Never mutate billing data.

Recommended structured output:

```js
{
  headline: string,
  summary: string,
  riskLevel: "none" | "low" | "medium" | "high" | "blocked",
  keyFindings: string[],
  recommendedActions: string[],
  confidence: "low" | "medium" | "high",
  provider: "gemini" | "heuristic-fallback",
  usedFallback: boolean,
  generatedAt: string
}
```

### 3. Build Compact Billing Snapshot

Use existing `electricityReview` data from `buildElectricityReview`.

Include only safe, compact fields:

- room name
- branch
- period status
- validation state
- data quality issue codes and messages
- anomaly risk level, score, confidence, and reasons
- open-period forecast values
- tenant summary totals without unnecessary PII
- billing state such as draft, ready, sent, or blocked

Do not send to Gemini:

- tenant email addresses
- uploaded files
- payment proofs
- full user profiles
- raw audit logs
- private notes
- full reservation documents

### 4. Gemini Prompt Rules

The billing prompt must instruct Gemini:

- Use only the provided billing snapshot.
- Do not invent readings, charges, tenants, dates, policy, or payment status.
- Do not say a bill was approved, rejected, changed, waived, or sent.
- Explain risks in admin-friendly language.
- Recommend human review actions only.
- Treat deterministic validation as the source of truth.

Example prompt intent:

> You are an assistant for dormitory utility billing review. Explain the electricity billing period using only the provided snapshot. Your output is advisory only. Do not modify or approve billing decisions.

### 5. Add API Endpoint

Add an admin-only endpoint under utility billing routes:

```text
POST /api/utility-billing/:utilityType/periods/:periodId/ai-review
```

V1 behavior:

- Supports `utilityType=electricity`.
- Returns a clear unavailable response for `utilityType=water`.
- Requires admin/owner billing access.
- Uses existing branch access rules.
- Does not mutate `UtilityPeriod`, `Bill`, `UtilityReading`, or `Reservation`.

Recommended response:

```js
{
  success: true,
  periodId,
  utilityType: "electricity",
  snapshotMeta: {
    provider,
    usedFallback,
    model,
    generatedAt
  },
  insight: {
    headline,
    summary,
    riskLevel,
    keyFindings,
    recommendedActions,
    confidence,
    disclaimer
  }
}
```

### 6. Backend Data Flow

Controller flow:

1. Verify admin/owner access.
2. Fetch the electricity period.
3. Fetch the room.
4. Fetch related periods for history.
5. Fetch related readings.
6. Fetch related reservations.
7. Build `electricityReview`.
8. Build the compact AI billing snapshot.
9. Generate Gemini insight.
10. Return insight response.

Fallback behavior:

- If Gemini is unavailable, return heuristic summary.
- If Gemini returns invalid JSON, return heuristic summary.
- If there is not enough billing data, return a low-confidence insight.
- Normal billing actions remain available unless deterministic rules block them.

### 7. Add Frontend API Hook

Add a frontend API method:

```js
getElectricityAiReview(periodId)
```

Recommended frontend behavior:

- Fetch on demand when admin opens AI review.
- Do not auto-call Gemini for every room or period.
- Cache by `periodId`.
- Refetch when the selected period changes.

### 8. Add Admin Utility Billing UI

In `UtilityBillingTab`, add an **AI Review** action for electricity periods.

Show the action for:

- open electricity periods with forecast data
- closed/revised electricity periods before sending bills
- periods with validation warnings
- periods with anomaly risk

Do not show the action for:

- water periods in v1
- missing period selection
- users without billing access

Panel content:

- title: `AI Billing Review`
- provider label: `Powered by Gemini` or `Fallback summary`
- headline
- summary
- risk level
- key findings
- recommended actions
- confidence
- disclaimer

### 9. Safety Rules

AI must not:

- approve bills
- send bills
- edit readings
- change tenant summaries
- change bill amounts
- waive charges
- override validation blocks
- auto-mark anything as paid

AI may:

- explain why a period needs review
- explain unusual usage
- summarize forecast risk
- recommend admin verification steps
- suggest which readings or tenant movements to inspect

### 10. Testing Plan

Backend service tests:

- Gemini success returns structured billing insight.
- Missing Gemini key falls back to heuristic insight.
- Invalid Gemini JSON falls back.
- Gemini timeout falls back.
- Snapshot does not include tenant email or sensitive fields.

Controller tests:

- Branch admin can review own-branch electricity period.
- Branch admin cannot review another branch.
- Owner can review any branch.
- Water period returns unsupported response.
- AI review does not mutate billing records.

Frontend checks:

- AI Review button appears for electricity periods.
- AI Review button does not appear for water periods.
- Panel renders Gemini provider label.
- Panel renders fallback provider label.
- Loading, error, and empty states are clear.
- Existing billing actions still work.

## Acceptance Criteria

- Admin can open an AI review for an electricity billing period.
- Gemini explains billing risks using existing validation, anomaly, and forecast data.
- If Gemini is unavailable, fallback insight still appears.
- AI output is advisory only and cannot change billing state.
- No sensitive tenant data is sent to Gemini.
- Tests pass for service, controller, and frontend behavior.

## Demo Script

Use this positioning:

> The billing module uses deterministic rules for billing math and validation, while Gemini AI assists admins by explaining unusual electricity usage, missing readings, forecasted utility costs, and recommended review steps before bills are sent.

Suggested demo flow:

1. Open Admin Billing.
2. Go to Electricity Billing.
3. Select a room with an active or recently closed electricity period.
4. Open AI Billing Review.
5. Show the Gemini-generated summary.
6. Point out that the AI does not change the bill.
7. Show that deterministic validation still controls whether the bill can be sent.

## Assumptions

- V1 is admin-only.
- V1 is electricity-only.
- AI is explain-only.
- Gemini uses the existing `GOOGLE_AI_API_KEY`.
- The current heuristic approach remains as fallback.
- Billing calculations and validation remain deterministic.
