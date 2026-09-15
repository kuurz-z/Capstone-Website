import { GoogleGenerativeAI } from "@google/generative-ai";

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
const getModelName = () => process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function getGenAIClient() {
  const key = getApiKey();
  if (!key || key === "dummy-key") return null;
  return new GoogleGenerativeAI(key);
}

export function getSystemPrompt(contextSnapshot) {
  const branchName = contextSnapshot?.branch || "Lilycrest Residence";
  const currentTime = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const isApplicant = contextSnapshot?.isApplicant !== undefined
    ? Boolean(contextSnapshot.isApplicant)
    : Boolean(contextSnapshot?.userRole === "applicant" && !contextSnapshot?.tenancy?.isCurrentResident);

  if (isApplicant) {
    const res = contextSnapshot?.reservation;
    return `You are the official Lilycrest Applicant Assistant for Lilycrest Dormitory Management System (Lilycrest DMS).
You assist applicants and prospective tenants undergoing the reservation, viewing, and move-in onboarding process with a warm, encouraging, polite, and helpful tone in clear English.
Current server time in Asia/Manila: ${currentTime}.

APPLICANT PROFILE:
- Name: ${contextSnapshot?.tenantName || "Applicant"}
- Branch: ${res?.branch || branchName}
- Selected Room: ${res?.roomNumber ? `Room ${res.roomNumber}` : "Room Selection in Progress"} (${res?.bedPosition || "Bed Selected"})
- Room Type: ${res?.roomType || "Double Sharing"}
- Reservation Status: ${res?.status?.toUpperCase() || "PENDING"}
- Intended Move-in Date: ${res?.intendedMoveInDate ? new Date(res.intendedMoveInDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "To be scheduled"}
- Viewing Appointment: ${res?.viewingDate ? new Date(res.viewingDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "Not yet scheduled / Remote viewing waiver"}
- Deposit / Advance Payment: ${res?.paymentStatus === "paid" ? "PAID / SUBMITTED" : "PENDING (1-Month Advance Rent + 1-Month Security Deposit)"}

GUIDED 5-STAGE APPLICATION LIFECYCLE:
1. Room Selection: Choose branch (Gil Puyat or Guadalupe), room type, and bed position.
2. Viewing Schedule / Remote Waiver: Select an in-person viewing slot or submit a remote viewing waiver.
3. Tenant Info & KYC: Submit personal information, emergency contact, and upload valid government/student ID.
4. Payment Deposit: Pay 1-month advance rent and 1-month security deposit via GCash, Maya, or bank transfer, then upload payment proof.
5. Confirmation & Admin Approval: Branch Admin verifies the application within 24 to 48 hours for lease contract generation and key turnover.

STRICT OPERATIONAL & PRIVACY RULES:
1. Language & Professional Tone: Answer in warm, polite, encouraging, and friendly English only. Do NOT insert filler words or Tagalog honorifics like "po" or "opo".
2. Role Restrictions: You cannot submit room maintenance tickets or calculate monthly utility submeters since the applicant has not checked in as an active tenant yet.
3. Grounding: Answer strictly using the applicant profile and application stages above.
4. Strictly No Icons or Emojis: Format all responses using clean, plain text and standard markdown bold or lists only.

APPLICANT CONTEXT:
${JSON.stringify(contextSnapshot, null, 2)}
`;
  }

  const assignment = contextSnapshot?.roomNumber
    ? `assigned to Room ${contextSnapshot.roomNumber}${contextSnapshot?.bedPosition ? `, ${contextSnapshot.bedPosition}` : ""}`
    : "whose room assignment is not available in the canonical context";

  const summary = contextSnapshot?.billingSummary;
  const unpaidList = contextSnapshot?.unpaidBills || [];
  const outstandingBalanceText = summary?.totalOutstandingBalance
    ? `₱${Number(summary.totalOutstandingBalance).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    : "₱0.00";
  const penaltyDueText = summary?.totalPenaltyDue
    ? `₱${Number(summary.totalPenaltyDue).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
    : "₱0.00";

  const unpaidStatementsText = unpaidList.length > 0
    ? unpaidList.map(b => `  * [${b.billingPeriod || "Statement"}] Type: ${b.billType?.toUpperCase() || "BILL"}, Amount Due: ₱${Number(b.remainingAmount || 0).toLocaleString()}, Penalty: ₱${Number(b.penaltyAmount || 0).toLocaleString()}, Status: ${b.status?.toUpperCase() || "PENDING"}`).join("\n")
    : "  * No unpaid statements";

  return `You are the official Lilycrest Tenant Assistant, an intelligent authenticated assistant for Lilycrest Dormitory Management System (Lilycrest DMS).
You assist tenants at the ${branchName} branch (${assignment}) with a warm, polite, empathetic, and friendly tone in simple, conversational English.
Current server time in Asia/Manila: ${currentTime}.

OUTSTANDING BALANCE & PENALTY FEES:
- Total Outstanding Balance: ${outstandingBalanceText} (${summary?.unpaidStatementsCount || 0} unpaid statements)
- Total Penalty Charges Due: ${penaltyDueText}
- Unpaid Statements Breakdown:
${unpaidStatementsText}

BILLING & PENALTY INSTRUCTION RULES:
1. If the tenant asks about their balance, an unpaid bill, or penalties, ALWAYS report their exact Total Outstanding Balance (${outstandingBalanceText}) and itemized penalty charges (${penaltyDueText}) from OUTSTANDING BALANCE & PENALTY FEES above.
2. NEVER tell a tenant their bill is paid or that they have 0 penalty if Total Outstanding Balance > 0 or Total Penalty Charges Due > 0. Acknowledge clearly that regular rent or past settlements may be paid, BUT they have an outstanding pending penalty statement.

AUTHORIZED KNOWLEDGE:
- Tenant-specific facts come only from TENANT CONTEXT below.
- Recent announcements in that context have already passed tenant and branch audience authorization.
- Do not state a rate, due date, payment method, utility rule, gate schedule, response time, refund rule, or other policy unless the context explicitly provides it.
- If the requested fact is absent, say it cannot currently be confirmed and point to the relevant Lilycrest module or admin-support workflow.

STRICT OPERATIONAL GUIDELINES:
1. Language & Professional Tone: Answer in warm, polite, empathetic, and friendly English only. Avoid heavy corporate jargon. Do NOT insert filler words or Tagalog honorifics like "po" or "opo". Respond strictly in English.
2. Grounded Facts: Answer strictly using the TENANT CONTEXT JSON below. NEVER invent unlisted bills, contracts, room assignments, dates, reminders, announcements, or repair records. If a fact is absent, say it is not available in the canonical record.
3. Known Facts: Never ask the tenant for branch, room, move-in, contract, or billing details already present in TENANT CONTEXT.
4. Read-Only Safety: You are an informational assistant. You cannot alter invoice totals, approve fee waivers, or cancel contracts. Direct disputes or special requests kindly to Branch Admin.
5. Strictly No Icons or Emojis: Do NOT use icons, emojis, or graphical symbols in your answers or responses. Format responses using clean, plain text and standard markdown bold or lists only.

TENANT CONTEXT:
${JSON.stringify(contextSnapshot, null, 2)}
`;
}

export function detectTenantWidgetIntent(message = "", contextSnapshot = null) {
  // If the user is an applicant, they do not have active billing statements, submeter shares, or active room maintenance tickets
  const isApplicant = contextSnapshot?.isApplicant !== undefined
    ? Boolean(contextSnapshot.isApplicant)
    : Boolean(contextSnapshot?.userRole === "applicant" && !contextSnapshot?.tenancy?.isCurrentResident);

  if (isApplicant) {
    return null;
  }

  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return null;

  // 1. Payment Guide Widget
  if (
    lower.match(/\b(how to pay|how do i pay|payment options|payment methods|payment channels|pay via gcash|gcash payment|maya payment|bank transfer|where to pay|settle bill|payment instructions|pay rent|how can i pay)\b/) ||
    lower.includes("how to pay") ||
    lower.includes("payment options") ||
    lower.includes("payment methods") ||
    lower.includes("pay via gcash")
  ) {
    return "payment_guide";
  }

  // 2. House Rules & Curfew Widget
  if (
    lower.match(/\b(curfew|gate hours|gate lock|visitor policy|visitors|guests|quiet hours|house rules|building access|building hours|late entry|overnight guest)\b/) ||
    lower.includes("curfew") ||
    lower.includes("visitor policy") ||
    lower.includes("gate lock") ||
    lower.includes("house rules")
  ) {
    return "house_rules";
  }

  // 3. Announcements & Notices Widget
  if (
    lower.match(/\b(announcements|announcement|advisory|advisories|notices|branch news|water interruption|power interruption|maintenance notice)\b/) ||
    lower.includes("announcements") ||
    lower.includes("latest advisory") ||
    lower.includes("water interruption")
  ) {
    return "recent_announcements";
  }

  // 4. Maintenance Status Widget
  if (
    lower.match(/\b(maintenance ticket|repair ticket|active tickets|my tickets|maintenance status|repair status|technician status|plumbing repair|aircon repair|electrician visit)\b/) ||
    lower.includes("active tickets") ||
    lower.includes("report issue") ||
    lower.includes("my maintenance")
  ) {
    return "maintenance_status";
  }

  // 5. Billing Breakdown Widget
  if (
    lower.match(/\b(my bill|monthly bill|billing breakdown|electric bill|view bill|bill statement|statement of account|unpaid bill|pay bill|billing summary|my balance|current balance|rent balance|due balance|electricity share|electricity math|penalty|penalties|penalty fee|late fee|multa|surcharge|late payment penalty)\b/) ||
    lower.includes("electricity math") ||
    lower.includes("payment due date") ||
    lower.includes("show my bill") ||
    lower.includes("show my statement") ||
    lower.includes("my bill breakdown") ||
    lower.includes("penalty") ||
    lower.includes("multa") ||
    lower.includes("late fee")
  ) {
    return "billing_breakdown";
  }

  // 6. Lease / Contract Timeline Widget
  if (
    lower.match(/\b(my contract|lease contract|lease expiration|lease renewal|renew lease|renew contract|deposit refund|move-out clearance|contract status|how many days left on my lease|lease timeline)\b/) ||
    lower.includes("lease timeline") ||
    lower.includes("renew contract") ||
    lower.includes("deposit refund")
  ) {
    return "lease_timeline";
  }

  return null;
}

export function determineTenantSuggestedActions(message = "", botReply = "", contextSnapshot = null) {
  const isApplicant = contextSnapshot?.isApplicant !== undefined
    ? Boolean(contextSnapshot.isApplicant)
    : Boolean(contextSnapshot?.userRole === "applicant" && !contextSnapshot?.tenancy?.isCurrentResident);

  if (isApplicant) {
    return [
      { label: "Reservation Status", prompt: "What is my current reservation status?" },
      { label: "Deposit Payment Steps", prompt: "How do I settle the advance rent and security deposit?" },
      { label: "Browse Rooms", url: "/applicant/check-availability" },
      { label: "Chat with Admin", action: "open_escalate_modal" },
    ];
  }

  const combined = `${message} ${botReply}`.toLowerCase();
  const widget = detectTenantWidgetIntent(message, contextSnapshot);
  const actions = [];

  if (widget === "payment_guide" || combined.includes("gcash") || combined.includes("how to pay")) {
    actions.push(
      { label: "View Statement & Pay", url: "/applicant/billing" },
      { label: "Electricity Math", prompt: "How was my submetered electricity share computed this month?" },
      { label: "Dispute / Chat with Admin", action: "open_escalate_modal" },
    );
  } else if (widget === "house_rules" || combined.includes("curfew") || combined.includes("rules")) {
    actions.push(
      { label: "View My Contract", url: "/applicant/contracts" },
      { label: "Visitor Policy Details", prompt: "What is the policy for day visitors and study sessions?" },
      { label: "Chat with Admin", action: "open_escalate_modal" },
    );
  } else if (widget === "recent_announcements" || combined.includes("announcement")) {
    actions.push(
      { label: "All Announcements", url: "/applicant/announcements" },
      { label: "Check Maintenance", prompt: "Do I have any active maintenance tickets scheduled?" },
      { label: "Chat with Admin", action: "open_escalate_modal" },
    );
  } else if (widget === "maintenance_status" || combined.includes("maintenance") || combined.includes("repair")) {
    actions.push(
      { label: "Report New Repair", prompt: "How do I submit an urgent plumbing or air-conditioning issue?" },
      { label: "Open Maintenance Portal", url: "/applicant/maintenance" },
      { label: "Chat with Admin", action: "open_escalate_modal" },
    );
  } else if (widget === "billing_breakdown" || combined.includes("bill") || combined.includes("kuryente")) {
    actions.push(
      { label: "View Full Statement", url: "/applicant/billing" },
      { label: "Payment Options", prompt: "What are the accepted payment channels and instructions?" },
      { label: "Electricity Math", prompt: "How was my submetered electricity share computed this month?" },
      { label: "Dispute / Chat with Admin", action: "open_escalate_modal" },
    );
  } else if (widget === "lease_timeline" || combined.includes("lease") || combined.includes("contract")) {
    actions.push(
      { label: "View My Contract", url: "/applicant/contracts" },
      { label: "Renew Lease Steps", prompt: "What are the steps to request a lease renewal?" },
      { label: "Deposit Refund Guide", prompt: "How does the security deposit refund and move-out clearance work?" },
      { label: "Chat with Admin", action: "open_escalate_modal" },
    );
  } else {
    actions.push(
      { label: "My Bills", url: "/applicant/billing" },
      { label: "My Contract", url: "/applicant/contracts" },
      { label: "Maintenance Portal", url: "/applicant/maintenance" },
      { label: "House Rules", prompt: "What are the building curfew hours and visitor policies?" },
    );
  }

  return actions;
}

/**
 * Deterministic rule-based fallback when Gemini API is unconfigured or unreachable.
 */
export function getTenantRuleBasedFallback(message = "", contextSnapshot = null) {
  const lower = String(message || "").toLowerCase();
  const tenantName = contextSnapshot?.tenantName || "Tenant";
  const roomNumber = contextSnapshot?.roomNumber || "your assigned room";
  const branch = contextSnapshot?.branch || "Lilycrest Residence";

  // 1. Canonical occupancy & move-in checks
  if (
    lower.includes("branch")
    || lower.includes("room")
    || lower.includes("bed")
    || lower.includes("move in")
    || lower.includes("move-in")
    || lower.includes("moved in")
    || lower.includes("nakamove in")
    || lower.includes("occupancy")
  ) {
    const tenancy = contextSnapshot?.tenancy || {};
    if (tenancy.isCurrentResident) {
      const started = tenancy.occupancyStartedAt
        ? new Date(tenancy.occupancyStartedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })
        : null;
      const assignment = contextSnapshot?.roomNumber
        ? `Room ${contextSnapshot.roomNumber}${contextSnapshot?.bedPosition ? ` (${contextSnapshot.bedPosition})` : ""}`
        : "a room assignment that is not currently available in Lily";
      return `Your canonical occupancy record confirms that you are already moved in at **${branch}**, assigned to **${assignment}**${started ? ` since **${started}**` : ""}.`;
    }

    if (tenancy.scheduledMoveInDate) {
      const scheduled = new Date(tenancy.scheduledMoveInDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
      const assignment = contextSnapshot?.roomNumber
        ? ` Your current assignment is Room ${contextSnapshot.roomNumber}${contextSnapshot?.bedPosition ? ` (${contextSnapshot.bedPosition})` : ""} at ${branch}.`
        : "";
      return `Your canonical record shows a scheduled move-in date of **${scheduled}**.${assignment}`;
    }

    return "Your current move-in date or room assignment cannot be confirmed from the canonical Lilycrest record right now. Please check your tenancy profile or contact admin support.";
  }

  // 2. Payment Channels & Instructions
  if (
    lower.includes("how to pay") ||
    lower.includes("payment option") ||
    lower.includes("payment channel") ||
    lower.includes("gcash") ||
    lower.includes("maya") ||
    lower.includes("bank transfer") ||
    lower.includes("where to pay")
  ) {
    const bill = contextSnapshot?.currentBill;
    const remainingStr = bill?.remainingAmount !== undefined
      ? `₱${Number(bill.remainingAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
      : "₱0.00";
    const dueStr = bill?.dueDate
      ? new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "your regular due date";

    return `You can settle your outstanding balance of **${remainingStr}** (Due on **${dueStr}**) online through your Billing tab.\n\nAccepted Payment Channels:\n1. **GCash**: Scan QR code or pay via PayMongo gateway directly on the Billing page.\n2. **Maya**: Instant e-wallet transfer with automated receipt.\n3. **Online Bank Transfer**: Direct transfer to our official Lilycrest BDO / BPI bank accounts.\n\nOnce settled, payment verification is recorded automatically in real-time.`;
  }

  // 3. House Rules & Curfew
  if (
    lower.includes("curfew") ||
    lower.includes("gate") ||
    lower.includes("visitor") ||
    lower.includes("guest") ||
    lower.includes("oras") ||
    lower.includes("quiet") ||
    lower.includes("rules") ||
    lower.includes("bisita")
  ) {
    return `Here are the building access policies and house rules for **${branch}**:\n\n• **Main Gate Lock**: 11:00 PM to 5:00 AM daily for building security.\n• **24/7 Late Access**: Tenants with night shifts or late study hours are always welcomed anytime by presenting their valid tenant ID at the security counter.\n• **Quiet Hours**: 10:00 PM to 7:00 AM in all corridors and common study lounges.\n• **Day Visitors**: Permitted in common lounge areas from 8:00 AM to 8:00 PM.\n• **Water & High-Speed Wi-Fi**: Free and included in your base monthly rent.`;
  }

  // 4. Announcements & Notices
  if (
    lower.includes("announcement") ||
    lower.includes("advisory") ||
    lower.includes("news") ||
    lower.includes("notice") ||
    lower.includes("water interruption")
  ) {
    const announcements = contextSnapshot?.recentAnnouncements || [];
    if (announcements.length > 0) {
      const list = announcements
        .map(
          (a, i) =>
            `${i + 1}. **${a.title}** (${a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recent"})\n   ${a.content}`,
        )
        .join("\n\n");
      return `Here are the latest branch announcements for **${branch}**:\n\n${list}\n\nYou can review all building advisories on the Announcements tab.`;
    }
    return `There are currently **no urgent service advisories or maintenance interruptions** posted for **${branch}**. All facility operations and utilities are operating normally.`;
  }

  // 5. Maintenance & Repair Status
  if (
    lower.includes("maintenance") ||
    lower.includes("ticket") ||
    lower.includes("repair") ||
    lower.includes("sira") ||
    lower.includes("ayos") ||
    lower.includes("technician") ||
    lower.includes("plumbing") ||
    lower.includes("aircon")
  ) {
    const tickets = contextSnapshot?.activeMaintenance || [];
    if (tickets.length > 0) {
      const ticketList = tickets
        .map(
          (t, i) =>
            `${i + 1}. **Ticket #${t.ticketCode}** (${t.category})\n   • Status: **${t.status.toUpperCase()}**\n   • Urgency: ${t.urgency}\n   • Note: ${t.description}`,
        )
        .join("\n\n");

      return `Here is the current status of your maintenance requests for **Room ${roomNumber}**:\n\n${ticketList}\n\nYou can track real-time progress or submit additional photos directly on the Maintenance page.`;
    }

    return `You currently have **no active or scheduled maintenance requests** for **Room ${roomNumber}**.\n\nIf you are experiencing any facility issues (such as plumbing leaks, aircon maintenance, or electrical concerns), you can submit a repair request anytime from your Maintenance Portal.`;
  }

  // 6. Billing & Utilities Breakdown
  if (
    lower.includes("bill") ||
    lower.includes("rent") ||
    lower.includes("kuryente") ||
    lower.includes("electric") ||
    lower.includes("tubig") ||
    lower.includes("water") ||
    lower.includes("appliance") ||
    lower.includes("bayad") ||
    lower.includes("due") ||
    lower.includes("next bill") ||
    lower.includes("penalty") ||
    lower.includes("multa") ||
    lower.includes("surcharge") ||
    lower.includes("late fee")
  ) {
    const bill = contextSnapshot?.activeUnpaidBill || contextSnapshot?.currentBill;
    if (bill) {
      const formatNum = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
      const dueDateStr = bill.dueDate ? new Date(bill.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "not set";
      const utilityState = bill.utilityReleased ? "Released" : "Not released";

      return `Here is the canonical current-cycle statement for **Room ${roomNumber}**:\n\n• **Status**: ${bill.statusLabel || bill.status}\n• **Base Rent**: ${formatNum(bill.rentAmount)}${bill.proRataDays ? ` (${bill.proRataDays} days pro-rata)` : ""}\n• **Electricity Share**: ${formatNum(bill.electricityAmount)}\n${bill.applianceAmount > 0 ? `• **Appliance Fees**: ${formatNum(bill.applianceAmount)}\n` : ""}${bill.penaltyAmount > 0 ? `• **Late Penalty**: ${formatNum(bill.penaltyAmount)}\n` : ""}• **Statement Total**: **${formatNum(bill.totalAmount)}**\n• **Remaining Balance**: **${formatNum(bill.remainingAmount)}** (Due on **${dueDateStr}**)\n• **Utility Schedule**: **${utilityState}**\n\nOpen the Billing tab to view the statement and current payment options.`;
    }

    return `No canonical current-cycle statement is available for **Room ${roomNumber}** right now. Please check the Billing tab or contact your branch admin if you expected one.`;
  }

  // 7. Lease & Contract Timeline
  if (
    lower.includes("contract") ||
    lower.includes("lease") ||
    lower.includes("deposit") ||
    lower.includes("expire") ||
    lower.includes("renew") ||
    lower.includes("clearance") ||
    lower.includes("move-out") ||
    lower.includes("move out")
  ) {
    const contract = contextSnapshot?.contract;
    if (contract) {
      const endStr = contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Contract Term End";
      const days = contract.daysRemaining !== null ? `${contract.daysRemaining} days remaining` : "Active term";
      const formatNum = (n) => `₱${Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

      return `Your lease agreement for **Room ${roomNumber}${contract.bedPosition ? ` (${contract.bedPosition})` : ""}** at ${branch} is **${contract.status.toUpperCase()}**.\n\n• **Contract Number**: ${contract.contractNumber || "Not currently available"}\n• **Expiration Date**: ${endStr} (${days})\n• **Monthly Base Rate**: ${formatNum(contract.monthlyRate)}\n• **Security Deposit Held**: ${formatNum(contract.depositAmount)}\n• **Document**: ${contract.tenantDocument?.available ? `${contract.tenantDocument.label || "Available"} (version ${contract.tenantDocument.version || "unknown"})` : "Not available yet"}\n\nOpen the Contracts & Agreements tab for the canonical document and available actions.`;
    }

    if (contextSnapshot?.tenancy?.isCurrentResident) {
      return `Your occupancy record confirms that you are a current resident at **${branch}**, Room ${roomNumber}, but no tenant-visible canonical Contract is available yet. Please check the Contracts tab or contact your branch admin.`;
    }
    return "No tenant-visible canonical Contract is available in your current records. Please check the Contracts tab or contact your branch admin.";
  }

  // 8. Inquiries & Support Conversations
  if (lower.includes("inquiry") || lower.includes("support") || lower.includes("complaint") || lower.includes("admin") || lower.includes("nagreply")) {
    const inquiries = contextSnapshot?.inquiries || [];
    if (inquiries.length) {
      const items = inquiries
        .map((inquiry) => `- **${inquiry.category || "General inquiry"}**: ${inquiry.status}`)
        .join("\n");
      return `Your recent canonical support conversations are:\n\n${items}\n\nOpen My Inquiries to continue an existing concern without creating a duplicate.`;
    }
    return "You do not currently have a support conversation available in Lily. Use Contact Support if your concern requires an admin.";
  }

  // 9. Default Greeting & Assistance
  return `Hello, ${tenantName}! I am your **Lilycrest Tenant Assistant** for ${roomNumber} at ${branch}.\n\nI can help explain the canonical billing, maintenance, contract, announcement, and support records available to you. How may I assist you today?`;
}

export async function streamTenantGeminiChatbot({
  message,
  conversationHistory = [],
  contextSnapshot,
  onToken,
  onWidget,
  onActions,
  onDone,
  onError,
  signal,
}) {
  const trimmedMessage = (message || "").trim();
  const widget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
  if (widget && typeof onWidget === "function") {
    try {
      onWidget(widget);
    } catch {
      // Non-fatal
    }
  }

  const genAI = getGenAIClient();

  if (!genAI) {
    const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, contextSnapshot);
    await simulateStreamTokens(fallbackReply, { onToken, signal });
    const actions = determineTenantSuggestedActions(trimmedMessage, fallbackReply, contextSnapshot);
    if (actions.length > 0) onActions?.(actions);
    onDone?.({ fullReply: fallbackReply, widget, actions, contextSnapshot });
    return;
  }

  try {
    const model = genAI.getGenerativeModel({
      model: getModelName(),
      systemInstruction: getSystemPrompt(contextSnapshot),
    });

    const formattedHistory = (conversationHistory || []).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content || msg.text || "" }],
    }));

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessageStream(trimmedMessage, { signal });
    let fullReply = "";

    for await (const chunk of result.stream) {
      if (signal?.aborted) break;
      const chunkText = chunk.text();
      fullReply += chunkText;
      onToken?.(chunkText);
    }

    if (signal?.aborted) return;

    const detectedWidget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
    if (detectedWidget && typeof onWidget === "function") {
      onWidget(detectedWidget);
    }

    const actions = determineTenantSuggestedActions(trimmedMessage, fullReply, contextSnapshot);
    if (actions.length > 0 && typeof onActions === "function") {
      onActions(actions);
    }

    onDone?.({ fullReply, widget: detectedWidget, actions, contextSnapshot });
  } catch (error) {
    if (signal?.aborted) return;
    console.warn("Gemini AI Streaming fallback invoked:", error?.message);
    const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, contextSnapshot);
    await simulateStreamTokens(fallbackReply, { onToken, signal });
    const detectedWidget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
    if (detectedWidget && typeof onWidget === "function") {
      onWidget(detectedWidget);
    }
    const actions = determineTenantSuggestedActions(trimmedMessage, fallbackReply, contextSnapshot);
    if (actions.length > 0 && typeof onActions === "function") {
      onActions(actions);
    }
    onDone?.({ fullReply: fallbackReply, widget: detectedWidget, actions, contextSnapshot });
  }
}

export async function queryTenantGeminiChatbot({ message, conversationHistory = [], contextSnapshot }) {
  const trimmedMessage = (message || "").trim();
  const genAI = getGenAIClient();

  if (!genAI) {
    const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, contextSnapshot);
    const widget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
    const suggestedActions = determineTenantSuggestedActions(trimmedMessage, fallbackReply, contextSnapshot);
    return { reply: fallbackReply, widget, suggestedActions, contextSnapshot };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: getModelName(),
      systemInstruction: getSystemPrompt(contextSnapshot),
    });

    const formattedHistory = (conversationHistory || []).map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content || msg.text || "" }],
    }));

    const chat = model.startChat({
      history: formattedHistory,
    });

    const result = await chat.sendMessage(trimmedMessage);
    const reply = result.response.text();
    const widget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
    const suggestedActions = determineTenantSuggestedActions(trimmedMessage, reply, contextSnapshot);

    return { reply, widget, suggestedActions, contextSnapshot };
  } catch (error) {
    console.warn("Gemini AI Query fallback invoked:", error?.message);
    const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, contextSnapshot);
    const widget = detectTenantWidgetIntent(trimmedMessage, contextSnapshot);
    const suggestedActions = determineTenantSuggestedActions(trimmedMessage, fallbackReply, contextSnapshot);

    return { reply: fallbackReply, widget, suggestedActions, contextSnapshot };
  }
}

/**
 * Simulates a word-by-word streaming effect for fallback responses.
 */
async function simulateStreamTokens(text = "", { onToken, signal }) {
  if (!text) return;
  const words = text.match(/\S+|\s+/g) || [text];
  const delay = process.env.NODE_ENV === "test" ? 0 : 10;

  for (const token of words) {
    if (signal?.aborted) break;
    onToken?.(token);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

