import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const historicalModal = read("./NewBillingPeriodModal.jsx");
const openModal = read("./OpenCurrentPeriodModal.jsx");
const closeModal = read("./CloseCurrentPeriodModal.jsx");
const billingTab = read("./UtilityBillingTab.jsx");
const overview = read("./utility/UtilityCycleOverviewCard.jsx");
const transferCard = read("../tenants/details/ScheduledRoomTransferCard.jsx");
const utilityApi = read("../../../../shared/api/utilityApi.js");
const utilityHooks = read("../../../../shared/hooks/queries/useUtility.js");

test("current-period opening and historical generation are separate admin commands", () => {
  assert.match(openModal, /useOpenUtilityPeriod/);
  assert.match(openModal, /Recovery \/ Manual Initialization/);
  assert.match(historicalModal, /useGenerateHistoricalUtilityPeriod/);
  assert.match(historicalModal, /Generate Historical/);
  assert.match(historicalModal, /useCloseUtilityPeriod/);
  assert.doesNotMatch(historicalModal, /useOpenUtilityPeriod|useDeleteUtilityPeriod/);
});

test("historical generation never deletes or replaces an active period", () => {
  assert.match(historicalModal, /An active period already exists/);
  assert.doesNotMatch(historicalModal, /deletePeriod\.mutateAsync/);
  assert.match(historicalModal, /generateHistoricalPeriod\.mutateAsync/);
});

test("overview exposes lifecycle-aware actions and a distinct manual-review state", () => {
  assert.match(overview, /!currentPeriod && !manualReviewPeriod/);
  assert.match(overview, /Recovery \/ Manual Initialization/);
  assert.match(overview, /New Billing Period/);
  assert.match(overview, /Close Legacy Cycle/);
  assert.match(overview, /Generate Historical Cycle/);
  assert.match(overview, /Billing Period Requires Review/);
  assert.match(billingTab, /periodList\.find\(\(p\) => p\.status === "manual_review_required"\)/);
});

test("normal close explains the occupied-versus-vacant continuation rule", () => {
  assert.match(closeModal, /useCloseUtilityPeriod/);
  assert.match(closeModal, /Close Current Period/);
  assert.match(closeModal, /Occupied rooms continue from this reading/);
  assert.match(closeModal, /vacant rooms remain without an active period/);
  assert.match(closeModal, /Close Period/);
  assert.doesNotMatch(closeModal, /Close &amp; Open Next/);
  assert.match(billingTab, /CloseCurrentPeriodModal/);
});

test("a vacant room without an active period is presented as a normal state", () => {
  assert.match(overview, /No Active Period — Room Currently Vacant/);
  assert.match(overview, /next move-in or transfer will initialize the period/);
  assert.match(overview, /activeTenantCount/);
});

test("move-in and transfer mutations invalidate utility lifecycle queries", () => {
  const reservationHooks = read("../../../../shared/hooks/queries/useReservations.js");
  const scheduledTransfer = read("../tenants/details/ScheduledRoomTransferCard.jsx");
  assert.match(reservationHooks, /queryKey: \["utilities"\]/);
  assert.match(scheduledTransfer, /queryKey: \["utilities"\]/);
});

test("opening readings accept zero but reject blank, negative, NaN, and Infinity", () => {
  assert.match(openModal, /value !== "" && Number\.isFinite\(Number\(value\)\) && Number\(value\) >= 0/);
  assert.match(openModal, /Zero is allowed/);
  assert.match(historicalModal, /startNum >= 0/);
  assert.match(historicalModal, /endNum >= 0/);
  assert.match(historicalModal, /isBlankValue\(periodForm\.startReading\)/);
});

test("transfer completion meter inputs enforce finite non-negative readings", () => {
  assert.match(transferCard, /Number\.isFinite\(Number\(sourceReading\)\) \|\| Number\(sourceReading\) < 0/);
  assert.match(transferCard, /Number\.isFinite\(Number\(targetReading\)\) \|\| Number\(targetReading\) < 0/);
  assert.match(transferCard, /type="number"[\s\S]*?min="0"[\s\S]*?step="0\.01"/);
});

test("the historical API and query hook use the dedicated endpoint", () => {
  assert.match(utilityApi, /periods\/historical/);
  assert.match(utilityHooks, /useGenerateHistoricalUtilityPeriod/);
  assert.match(utilityHooks, /utilityApi\.generateHistoricalPeriod/);
});
