import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const launcherSource = fs.readFileSync(path.join(here, "TenantAssistantLauncher.jsx"), "utf8");
const drawerSource = fs.readFileSync(path.join(here, "TenantAssistantDrawer.jsx"), "utf8");
const billingCardSource = fs.readFileSync(path.join(here, "cards/TenantBillingBreakdownCard.jsx"), "utf8");
const leaseCardSource = fs.readFileSync(path.join(here, "cards/TenantLeaseTimelineCard.jsx"), "utf8");
const maintenanceCardSource = fs.readFileSync(path.join(here, "cards/TenantMaintenanceCard.jsx"), "utf8");
const escalateModalSource = fs.readFileSync(path.join(here, "modals/TenantHumanEscalateModal.jsx"), "utf8");
const stylesSource = fs.readFileSync(path.join(here, "../../styles/tenant-assistant.css"), "utf8");
const layoutSource = fs.readFileSync(path.join(here, "../../../../shared/layouts/TenantLayout.jsx"), "utf8");

test("TenantAssistantLauncher renders accessible floating button and unread badge", () => {
  assert.match(launcherSource, /tenant-assistant-launcher/);
  assert.match(launcherSource, /aria-label="Open Lilycrest AI Assistant"/);
  assert.match(launcherSource, /onClick=\{onClick\}/);
});

test("TenantAssistantDrawer includes header, route prompts, chat stream, and escalation trigger", () => {
  assert.match(drawerSource, /tenant-assistant-drawer/);
  assert.match(drawerSource, /tenant-assistant-backdrop/);
  assert.match(drawerSource, /tenant-assistant-banner/);
  assert.match(drawerSource, /activeRoutePrompts/);
  assert.match(drawerSource, /streamTenantAssistant/);
  assert.match(drawerSource, /TenantBillingBreakdownCard/);
  assert.match(drawerSource, /TenantLeaseTimelineCard/);
  assert.match(drawerSource, /TenantMaintenanceCard/);
  assert.match(drawerSource, /TenantHumanEscalateModal/);
});

test("TenantBillingBreakdownCard renders breakdown numbers, water consumption when billed, and link to /applicant/billing", () => {
  assert.match(billingCardSource, /tenant-snapshot-card/);
  assert.match(billingCardSource, /Base Monthly Rent/);
  assert.match(billingCardSource, /Electricity Share/);
  assert.match(billingCardSource, /Water Consumption/);
  assert.doesNotMatch(billingCardSource, /FREE/);
  assert.match(billingCardSource, /\/applicant\/billing/);
});

test("TenantLeaseTimelineCard renders room, progress track, days left, and link to /applicant/contracts", () => {
  assert.match(leaseCardSource, /tenant-lease-progress-track/);
  assert.match(leaseCardSource, /tenant-lease-progress-fill/);
  assert.match(leaseCardSource, /Lease Start/);
  assert.match(leaseCardSource, /Lease Expiration/);
  assert.match(leaseCardSource, /Security Deposit Held/);
  assert.match(leaseCardSource, /\/applicant\/contracts/);
});

test("TenantMaintenanceCard renders ticket code, urgency badge, technician status, and link to /applicant/maintenance", () => {
  assert.match(maintenanceCardSource, /tenant-snapshot-card/);
  assert.match(maintenanceCardSource, /Service Provider/);
  assert.match(maintenanceCardSource, /Scheduled Visit/);
  assert.match(maintenanceCardSource, /\/applicant\/maintenance/);
});

test("TenantHumanEscalateModal handles category selection, character count, and calls escalateTenantAssistant", () => {
  assert.match(escalateModalSource, /Escalate to Branch Admin/);
  assert.match(escalateModalSource, /escalate-category/);
  assert.match(escalateModalSource, /escalate-summary/);
  assert.match(escalateModalSource, /escalateTenantAssistant/);
});

test("TenantLayout mounts TenantAssistantLauncher and TenantAssistantDrawer", () => {
  assert.match(layoutSource, /TenantAssistantLauncher/);
  assert.match(layoutSource, /TenantAssistantDrawer/);
  assert.match(layoutSource, /isAssistantOpen/);
});

test("CSS strictly enforces solid HSL design with zero gradients and fluid responsiveness", () => {
  assert.doesNotMatch(stylesSource, /linear-gradient/i);
  assert.doesNotMatch(stylesSource, /radial-gradient/i);
  assert.match(stylesSource, /\.tenant-assistant-launcher/);
  assert.match(stylesSource, /\.tenant-assistant-drawer/);
  assert.match(stylesSource, /max-width:\s*440px/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*640px\)/);
  assert.match(stylesSource, /max-width:\s*100vw/);
});

test("CSS enforces Navy Blue in light mode and Golden Yellow in dark mode for launcher and assistant UI", () => {
  // Light mode launcher: Navy background, gold icon, navy badge shadow
  assert.match(stylesSource, /\.tenant-assistant-launcher\s*\{[^}]*background-color:\s*#0A1628;/);
  assert.match(stylesSource, /\.tenant-assistant-launcher\s*\{[^}]*color:\s*#D4AF37/);
  assert.match(stylesSource, /\.tenant-assistant-launcher-badge\s*\{[^}]*box-shadow:\s*0 0 0 2px #0A1628;/);

  // Dark mode launcher: Gold background, navy icon, gold badge shadow
  assert.match(stylesSource, /\.dark \.tenant-assistant-launcher[^{]*\{[^}]*background-color:\s*#D4AF37;/);
  assert.match(stylesSource, /\.dark \.tenant-assistant-launcher[^{]*\{[^}]*color:\s*#0A1628/);
  assert.match(stylesSource, /\.dark \.tenant-assistant-launcher-badge[^{]*\{[^}]*box-shadow:\s*0 0 0 2px #D4AF37;/);

  // Drawer avatar badge
  assert.match(stylesSource, /\.tenant-assistant-avatar-badge\s*\{[^}]*background-color:\s*#0A1628;/);
  assert.match(stylesSource, /\.dark \.tenant-assistant-avatar-badge[^{]*\{[^}]*background-color:\s*#D4AF37;/);

  // User chat bubbles
  assert.match(stylesSource, /\.tenant-msg-row\.user \.tenant-msg-bubble\s*\{[^}]*background-color:\s*#0A1628;/);
  assert.match(stylesSource, /\.dark \.tenant-msg-row\.user \.tenant-msg-bubble[^{]*\{[^}]*background-color:\s*#D4AF37;/);

  // Send buttons
  assert.match(stylesSource, /\.tenant-assistant-send-btn\s*\{[^}]*background-color:\s*#0A1628;/);
  assert.match(stylesSource, /\.dark \.tenant-assistant-send-btn[^{]*\{[^}]*background-color:\s*#D4AF37;/);

  // Snapshot card action buttons and progress bar
  assert.match(stylesSource, /\.dark \.tenant-snapshot-action-btn[^{]*\{[^}]*background-color:\s*#D4AF37;/);
  assert.match(stylesSource, /\.dark \.tenant-lease-progress-fill[^{]*\{[^}]*background-color:\s*#D4AF37;/);
});

const paymentCardSource = fs.readFileSync(path.join(here, "cards/TenantPaymentGuideCard.jsx"), "utf8");
const houseRulesCardSource = fs.readFileSync(path.join(here, "cards/TenantHouseRulesCard.jsx"), "utf8");
const announcementCardSource = fs.readFileSync(path.join(here, "cards/TenantAnnouncementCard.jsx"), "utf8");

test("TenantPaymentGuideCard renders balance due, payment channels (GCash, Bank Transfer), and link to /applicant/billing", () => {
  assert.match(paymentCardSource, /tenant-snapshot-card/);
  assert.match(paymentCardSource, /Payment Channels Guide/);
  assert.match(paymentCardSource, /GCash \/ Maya/);
  assert.match(paymentCardSource, /Online Bank Transfer/);
  assert.match(paymentCardSource, /\/applicant\/billing/);
});

test("TenantHouseRulesCard renders gate hours, quiet hours, visitor policy, and link to /applicant/contracts", () => {
  assert.match(houseRulesCardSource, /tenant-snapshot-card/);
  assert.match(houseRulesCardSource, /Building Access & Rules/);
  assert.match(houseRulesCardSource, /11:00 PM – 5:00 AM/);
  assert.match(houseRulesCardSource, /Quiet Hours/);
  assert.match(houseRulesCardSource, /Day Visitors/);
  assert.match(houseRulesCardSource, /\/applicant\/contracts/);
});

test("TenantAnnouncementCard renders branch advisory notice, and link to /applicant/announcements", () => {
  assert.match(announcementCardSource, /tenant-snapshot-card/);
  assert.match(announcementCardSource, /Branch Advisory/);
  assert.match(announcementCardSource, /\/applicant\/announcements/);
});

test("TenantAssistantDrawer includes action chip routing, stop button, and copy transcript", () => {
  assert.match(drawerSource, /handleStopGeneration/);
  assert.match(drawerSource, /tenant-assistant-stop-btn/);
  assert.match(drawerSource, /handleCopyTranscript/);
  assert.match(drawerSource, /action\.url|act\.url/);
  assert.match(drawerSource, /TenantPaymentGuideCard/);
  assert.match(drawerSource, /TenantHouseRulesCard/);
  assert.match(drawerSource, /TenantAnnouncementCard/);
});

test("TenantBillingBreakdownCard and TenantLeaseTimelineCard enforce strict data validity checks", () => {
  assert.match(billingCardSource, /hasValidBillData/);
  assert.match(billingCardSource, /if \(!data \|\| !hasValidBillData\) return null;/);
  assert.match(leaseCardSource, /hasValidContract/);
  assert.match(leaseCardSource, /if \(!data \|\| !hasValidContract\) return null;/);
  assert.match(drawerSource, /const billData = (?:widgetData\?\.activeUnpaidBill\s*\|\|\s*)?widgetData\?\.currentBill/);
});

test("TenantAssistantDrawer supports unified single-stream live support, escalation handoff, and resolution confirm", () => {
  assert.match(drawerSource, /activeTicket/);
  assert.match(drawerSource, /chatApi\.getMyConversations/);
  assert.match(drawerSource, /chatApi\.sendTenantMessage/);
  assert.match(drawerSource, /chatApi\.confirmTenantResolution/);
  assert.match(drawerSource, /system_escalation/);
  assert.match(drawerSource, /resolution_prompt/);
  assert.match(drawerSource, /system_ended/);
  assert.match(drawerSource, /Has your concern been resolved/);
});

test("TenantAssistantDrawer explicitly imports all React hooks it utilizes", () => {
  assert.match(drawerSource, /import React,\s*\{[^}]*useState[^}]*\}\s*from\s*"react"/);
  assert.match(drawerSource, /import React,\s*\{[^}]*useEffect[^}]*\}\s*from\s*"react"/);
  assert.match(drawerSource, /import React,\s*\{[^}]*useRef[^}]*\}\s*from\s*"react"/);
  assert.match(drawerSource, /import React,\s*\{[^}]*useMemo[^}]*\}\s*from\s*"react"/);
  assert.match(drawerSource, /import React,\s*\{[^}]*useCallback[^}]*\}\s*from\s*"react"/);
});

test("TenantAssistantDrawer enforces user-scoped storage keys and resets state on account switch", () => {
  assert.match(drawerSource, /getTenantAssistantStorageKey/);
  assert.match(drawerSource, /BASE_STORAGE_KEY/);
  assert.match(drawerSource, /userStorageKey/);
  assert.match(drawerSource, /sessionStorage\.getItem\(userStorageKey\)/);
  assert.match(drawerSource, /sessionStorage\.setItem\(userStorageKey/);
  assert.match(drawerSource, /sessionStorage\.removeItem\(userStorageKey\)/);
  assert.match(drawerSource, /setMessages\(saved \? JSON\.parse\(saved\) : \[\]\)/);
});

test("TenantAssistantDrawer prioritizes activeUnpaidBill over currentBill for statement cards", () => {
  assert.match(drawerSource, /activeUnpaidBill/);
});

test("TenantBillingBreakdownCard supports standalone penalty billType and title formatting", () => {
  assert.match(billingCardSource, /Penalty Fee Statement/);
});

