/**
 * ============================================================================
 * LILYCREST TENANT CONTEXT-AWARE AI ASSISTANT SERVICE (PHASE 2 MULTI-PROVIDER)
 * ============================================================================
 *
 * Provides real-time, grounded conversational assistance for authenticated tenants.
 * Grounded on the tenant's actual room occupancy, pro-rata utility billings,
 * active lease contract timelines, and maintenance tickets.
 *
 * Features:
 * - Real-time MongoDB context retrieval (User, Contract, Room, Bill, MaintenanceRequest)
 * - Ultra-low-latency streaming via Groq Llama 3.3 / Gemini 2.5 Flash
 * - Natural Tagalog/Taglish conversational fluency with polite Filipino hospitality
 * - Server-Sent Events (SSE) token streaming
 * - Rich UI widget intent detection (Billing Breakdown, Lease Timeline, Maintenance Card)
 * - Dynamic suggested action pills with route links
 * - Zero-downtime offline rule-based fallback streaming
 * ============================================================================
 */

import { User, Contract, Room, Bill, MaintenanceRequest, Inquiry, Reservation } from "../../models/index.js";
import { APPLIANCE_FEES } from "./knowledgeBase.js";
import {
  streamChatCompletion,
  generateChatCompletion,
  buildStandardMessages,
} from "./aiProviderService.js";

/**
 * Gathers complete live stay context for an authenticated tenant.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<Object>}
 */
export async function getTenantStayContext(userId) {
  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      return null;
    }

    // 1. Fetch active or most recent contract
    const contract = await Contract.findOne({
      tenantId: user._id,
      status: { $nin: ["voided", "cancelled", "rejected", "archived"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    // 1b. Fetch reservation if contract is not yet active (Applicant onboarding)
    const reservation = await Reservation.findOne({
      $or: [{ userId: user._id }, { user: user._id }],
      isArchived: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate("roomId")
      .lean();

    // 2. Fetch room details if roomId is available
    let room = null;
    if (contract?.roomId) {
      room = await Room.findById(contract.roomId).lean();
    } else if (reservation?.roomId) {
      room = typeof reservation.roomId === "object" ? reservation.roomId : await Room.findById(reservation.roomId).lean();
    } else if (user.roomId) {
      room = await Room.findById(user.roomId).lean();
    }

    // 3. Fetch most recent bill record
    const latestBill = await Bill.findOne({
      userId: user._id,
      status: { $nin: ["voided"] },
    })
      .sort({ billingMonth: -1, createdAt: -1 })
      .lean();

    // 4. Fetch recent maintenance tickets
    const recentMaintenance = await MaintenanceRequest.find({
      userId: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    const branchName =
      contract?.branch ||
      reservation?.branch ||
      room?.branch ||
      user.branch ||
      "Guadalupe";

    const roomNumber =
      room?.roomNumber ||
      contract?.roomNumber ||
      reservation?.roomNumber ||
      user.roomNumber ||
      "Unassigned";

    const bedLabel =
      contract?.bedLabel ||
      reservation?.selectedBed?.id ||
      reservation?.selectedBed?.position ||
      user.bedNumber ||
      "Bed 1";

    const roomType =
      room?.roomType ||
      room?.type ||
      contract?.roomType ||
      reservation?.roomType ||
      "Double Sharing";

    let daysRemaining = null;
    if (contract?.endDate) {
      const end = new Date(contract.endDate);
      const now = new Date();
      const diffTime = end.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    const contractStartDate = contract?.startDate ? new Date(contract.startDate) : null;
    const leaseDay = contractStartDate && !isNaN(contractStartDate.getTime()) ? contractStartDate.getDate() : null;
    const ordinalSuffix = (d) => {
      if (d > 3 && d < 21) return `${d}th`;
      switch (d % 10) {
        case 1: return `${d}st`;
        case 2: return `${d}nd`;
        case 3: return `${d}rd`;
        default: return `${d}th`;
      }
    };
    const leaseCycleText = leaseDay ? `${ordinalSuffix(leaseDay)} of each month` : "Monthly lease cycle";
    const isExplicitTenant = user?.role === "tenant" || user?.tenantStatus === "active" || reservation?.status === "moveIn";
    const isApplicant = !isExplicitTenant && !contract && (Boolean(reservation) || user?.role === "applicant");

    return {
      user: {
        id: String(user._id),
        name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Tenant",
        email: user.email,
        phone: user.phone || "N/A",
        role: user.role || (isApplicant ? "applicant" : "tenant"),
        branch: branchName,
      },
      isApplicant,
      reservation: reservation
        ? {
            id: String(reservation._id),
            status: reservation.status || "pending",
            branch: branchName,
            roomNumber,
            bedLabel,
            roomType,
            intendedMoveInDate: reservation.intendedMoveInDate || reservation.preferredMoveInDate || reservation.moveInDate || null,
            viewingDate: reservation.viewingDate || reservation.viewingSchedule?.date || null,
            paymentStatus: reservation.paymentStatus || (reservation.depositPaid ? "paid" : "pending"),
            monthlyRent: reservation.monthlyRate || reservation.totalPrice || 5500,
          }
        : null,
      contract: contract
        ? {
            id: String(contract._id),
            contractNumber: contract.contractNumber || "N/A",
            status: contract.status,
            roomNumber,
            bedLabel,
            roomType,
            branch: branchName,
            monthlyRent: contract.monthlyRent || room?.monthlyRate || 5500,
            securityDeposit: contract.securityDeposit || 5500,
            leaseStartDate: contract.startDate ? new Date(contract.startDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "N/A",
            leaseEndDate: contract.endDate ? new Date(contract.endDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "N/A",
            leaseCycleDay: leaseDay,
            daysRemaining,
            isExpiringSoon: daysRemaining !== null && daysRemaining <= 30,
          }
        : null,
      room: {
        number: roomNumber,
        type: roomType,
        branch: branchName,
        floor: room?.floor || 1,
        capacity: room?.capacity || 2,
        currentOccupants: room?.currentOccupants || 1,
      },
      bill: latestBill
        ? {
            id: String(latestBill._id),
            invoiceNumber: latestBill.invoiceNumber || "N/A",
            billingMonth: latestBill.billingMonth || new Date().toISOString().slice(0, 7),
            totalAmount: latestBill.totalAmount || 0,
            remainingAmount: latestBill.remainingAmount !== undefined ? latestBill.remainingAmount : latestBill.totalAmount || 0,
            rentAmount: latestBill.charges?.rent || latestBill.rentAmount || 0,
            electricityAmount: latestBill.charges?.electricity || latestBill.electricityAmount || 0,
            waterAmount: latestBill.charges?.water || latestBill.waterAmount || 0,
            applianceCharges: latestBill.charges?.applianceFees || latestBill.applianceCharges || 0,
            lateFee: latestBill.charges?.penalty || latestBill.lateFee || 0,
            status: latestBill.status || "unpaid",
            dueDate: latestBill.dueDate ? new Date(latestBill.dueDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : leaseCycleText,
          }
        : null,
      leaseCycleText,
      maintenance: recentMaintenance.map((m) => ({
        id: String(m._id),
        ticketNumber: m.ticketNumber || `REQ-${String(m._id).slice(-6).toUpperCase()}`,
        issueTitle: m.issueTitle || m.title || m.category || "Maintenance Request",
        category: m.category || "General",
        status: m.status || "pending",
        priority: m.priority || "medium",
        createdAt: new Date(m.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }),
      })),
    };
  } catch (err) {
    console.error("[TenantAssistant] Error retrieving tenant stay context:", err.message);
    return null;
  }
}

/**
 * Detects whether the tenant message warrants a rich context widget.
 */
export function detectTenantWidgetIntent(message = "", context = null) {
  const text = (message || "").toLowerCase();

  // 1. Billing & Electricity Breakdown Intent
  if (
    text.includes("bill") ||
    text.includes("bayad") ||
    text.includes("electric") ||
    text.includes("kuryente") ||
    text.includes("tubig") ||
    text.includes("water") ||
    text.includes("invoice") ||
    text.includes("due date") ||
    text.includes("magkano") ||
    text.includes("statement") ||
    text.includes("penalty") ||
    text.includes("penalties") ||
    text.includes("late fee") ||
    text.includes("multa") ||
    text.includes("surcharge")
  ) {
    const fallbackDue = context?.leaseCycleText || "Monthly lease cycle";
    return {
      type: "billing_breakdown",
      title: "Current Statement of Account",
      data: {
        bill: context?.bill || {
          status: "paid",
          totalAmount: 0,
          remainingAmount: 0,
          electricityAmount: 0,
          waterAmount: 0,
          rentAmount: context?.contract?.monthlyRent || 5500,
          lateFee: 0,
          dueDate: fallbackDue,
        },
        contract: context?.contract,
        waterIncluded: true,
        electricityNote: "Electricity is metered per room and shared pro-rata among room occupants.",
      },
    };
  }

  // 2. Lease Timeline & Contract Intent
  if (
    text.includes("contract") ||
    text.includes("lease") ||
    text.includes("kailan matatapos") ||
    text.includes("renew") ||
    text.includes("deposit") ||
    text.includes("move out") ||
    text.includes("clearance") ||
    text.includes("kontrata")
  ) {
    return {
      type: "lease_timeline",
      title: "Your Lease & Tenancy Status",
      data: {
        contract: context?.contract || {
          status: "active",
          roomNumber: context?.room?.number || "Unassigned",
          bedLabel: "Bed 1",
          leaseStartDate: "Active",
          leaseEndDate: "Active Lease",
          daysRemaining: null,
          monthlyRent: 5500,
        },
        user: context?.user,
        renewalEligible: true,
      },
    };
  }

  // 3. Maintenance Ticket Intent
  if (
    text.includes("maintenance") ||
    text.includes("repair") ||
    text.includes("sira") ||
    text.includes("ayos") ||
    text.includes("aircon") ||
    text.includes("faucet") ||
    text.includes("banyo") ||
    text.includes("ticket") ||
    text.includes("technician")
  ) {
    return {
      type: "maintenance_summary",
      title: "Maintenance & Repair Requests",
      data: {
        roomNumber: context?.room?.number || "Your Room",
        tickets: context?.maintenance || [],
        canSubmitNew: true,
      },
    };
  }

  return null;
}

/**
 * Builds the contextual system prompt grounded on the tenant's exact database profile.
 */
export function buildTenantSystemPrompt(context) {
  const user = context?.user;
  const contract = context?.contract;
  const bill = context?.bill;
  const maintenance = context?.maintenance || [];
  const reservation = context?.reservation;
  const isApplicant = context?.isApplicant !== undefined
    ? Boolean(context.isApplicant)
    : Boolean(user?.role === "applicant" && !contract && reservation?.status !== "moveIn");

  if (isApplicant) {
    return `
You are the dedicated Lilycrest Applicant AI Assistant for Lilycrest Dormitory Management System (Lilycrest DMS).
You assist prospective tenants and applicants who are undergoing the reservation, viewing, and move-in onboarding lifecycle with a warm, encouraging, polite, and helpful tone in clear English.

AUTHENTICATED APPLICANT PROFILE:
- Applicant Name: ${user?.name || "Applicant"}
- Target Branch: ${reservation?.branch || user?.branch || "Guadalupe Branch (Makati City)"}
- Selected Room: ${reservation?.roomNumber ? `Room ${reservation.roomNumber}` : "Room Selection in Progress"} (${reservation?.bedPosition || "Bed Selected"})
- Room Type: ${reservation?.roomType || "Double Sharing"}
- Reservation Status: ${reservation?.status?.toUpperCase() || "PENDING"}
- Intended Move-in Date: ${reservation?.intendedMoveInDate ? new Date(reservation.intendedMoveInDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "To be scheduled"}
- Viewing Appointment: ${reservation?.viewingDate ? new Date(reservation.viewingDate).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "Not yet scheduled / Remote viewing waiver"}
- Deposit / Advance Payment: ${reservation?.paymentStatus === "paid" ? "PAID / SUBMITTED" : "PENDING (1-Month Advance Rent + 1-Month Security Deposit)"}

GUIDED 5-STAGE APPLICATION LIFECYCLE:
1. Room Selection: Choose branch (Gil Puyat or Guadalupe), room type, and bed position.
2. Viewing Schedule / Remote Waiver: Select an in-person viewing slot or submit a remote viewing waiver.
3. Tenant Info & KYC: Submit personal information, emergency contact, and upload valid government/student ID.
4. Payment Deposit: Pay 1-month advance rent and 1-month security deposit via GCash, Maya, or bank transfer, then upload payment proof.
5. Confirmation & Admin Approval: Branch Admin verifies the application within 24 to 48 hours for lease contract generation and key turnover.

STRICT OPERATIONAL & PRIVACY RULES:
1. Tone & Phrasing: Always write in warm, polite, encouraging, and friendly English only. Do NOT use filler words or Tagalog honorifics like "po" or "opo".
2. Role Restrictions: You cannot submit room maintenance tickets or calculate monthly utility submeters since the applicant has not checked in as an active tenant yet.
3. Grounding: Answer strictly using the applicant profile and application stages above.
4. Strictly No Icons or Emojis: Format all responses using clean, plain text and standard markdown bold or lists only.
`;
  }

  return `
You are the dedicated Lilycrest Tenant AI Assistant for Lilycrest Dormitory Management System (Lilycrest DMS).
You assist active dormitory tenants with a warm, polite, empathetic, and friendly tone in clear, conversational English.

AUTHENTICATED TENANT PROFILE:
- Tenant Name: ${user?.name || "Tenant"}
- Branch: ${user?.branch || "Guadalupe Branch (Makati City)"}
- Room Number: Room ${contract?.roomNumber || user?.roomNumber || "Unassigned"} (${contract?.bedLabel || "Bed 1"})
- Room Type: ${contract?.roomType || "Double Sharing"}
- Base Monthly Rent: ₱${contract?.monthlyRent ? Number(contract.monthlyRent).toLocaleString() : "5,500"}/month

ACTIVE LEASE CONTRACT:
- Contract Status: ${contract?.status || "active"}
- Lease Start: ${contract?.leaseStartDate || "Active"}
- Lease End: ${contract?.leaseEndDate || "Active"}
- Days Remaining: ${contract?.daysRemaining !== null ? `${contract.daysRemaining} days` : "Ongoing"}
- Expiring Soon: ${contract?.isExpiringSoon ? "YES (within 30 days)" : "NO"}

LATEST BILLING STATEMENT:
- Status: ${bill?.status?.toUpperCase() || "NO UNPAID BILLS"}
- Total Due: ₱${bill?.remainingAmount !== undefined ? Number(bill.remainingAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 }) : bill?.totalAmount ? Number(bill.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "0.00"}
- Due Date: ${bill?.dueDate || context?.leaseCycleText || "Follows monthly lease start date"}
- Rent Amount: ₱${bill?.rentAmount ? Number(bill.rentAmount).toLocaleString() : "0.00"}
- Electricity Share (Pro-Rata): ₱${bill?.electricityAmount ? Number(bill.electricityAmount).toLocaleString() : "0.00"}
- Water: Free (Included in rent)
- Late Fee / Penalty: ₱${bill?.lateFee ? Number(bill.lateFee).toLocaleString("en-PH", { minimumFractionDigits: 2 }) : "0.00"}

ACTIVE MAINTENANCE TICKETS:
${
  maintenance.length > 0
    ? maintenance.map((m) => `- [${m.ticketNumber}] ${m.issueTitle} (Status: ${m.status.toUpperCase()}, Priority: ${m.priority})`).join("\n")
    : "No active maintenance tickets."
}

FRIENDLY DORMITORY POLICIES & STEP-BY-STEP EXPLANATIONS:
1. Pro-Rata Electricity Sharing:
   - Your room has its own electric submeter that measures actual kilowatt-hours used.
   - Total electricity charges are recorded and computed on the 15th of each month, then divided equally among active roommates for the billing period.
   - Water consumption and high-speed Wi-Fi are completely free and included in your rent!
2. Monthly Rent & Due Dates:
   - Base monthly rent due dates follow each tenant's individual move-in / lease start date (NOT fixed to the 15th for all tenants).
   - Utility/electricity charges follow the monthly 15th submeter reading cycle.
   - Payments can easily and securely be settled online via bank transfer or GCash in your Billing tab.
3. Contract Expiration & Lease Renewal:
   - You can easily request a lease renewal 30 days before your contract expires directly from the Contracts tab.
4. Move-Out Clearance & Security Deposit:
   - Your security deposit is held safely and is fully refundable upon completing a smooth move-out room check.
5. Maintenance & Repair Tickets:
   - If anything needs fixing (plumbing, lights, aircon), submit a ticket under the Maintenance tab.
   - Our accredited on-site technicians attend to repairs promptly within 24-48 hours.
6. Building Hours & Curfew:
   - Building gates lock from 11:00 PM to 5:00 AM for security.
   - 24/7 late entry is always welcomed for tenants with night shifts or late study hours with a valid ID.

STRICT BEHAVIOR RULES:
1. Tone & Phrasing: Always write in warm, polite, empathetic, and friendly English only. Keep explanations simple, reassuring, and free of heavy corporate jargon. Do NOT insert Tagalog terms or filler honorifics such as "po" or "opo".
2. Conciseness: Answer helpfully in 2 to 4 clear, well-structured sentences.
3. Factual Grounding: Ground all answers strictly on the tenant's data above. Never fabricate bills, dates, or ticket statuses.
4. Escalation: If a tenant has a dispute or urgent concern, kindly offer to connect them directly with the Branch Admin.
5. Strictly No Icons or Emojis: Do NOT use icons, emojis, or graphical symbols in your answers or responses. Format all responses using clean, plain text and standard markdown bold or lists only.
`;
}

/**
 * Determines suggested action pills for the tenant assistant.
 */
export function determineTenantSuggestedActions(message = "", botReply = "", context = null) {
  const actions = [];
  const text = `${message} ${botReply}`.toLowerCase();
  const isApplicant = context?.isApplicant !== undefined
    ? Boolean(context.isApplicant)
    : Boolean(context?.user?.role === "applicant" && !context?.contract && context?.reservation?.status !== "moveIn");

  if (isApplicant) {
    actions.push({ label: "Application Status", prompt: "What is my current reservation status?" });
    actions.push({ label: "Deposit Payment Steps", prompt: "How do I settle the advance rent and deposit?" });
    actions.push({ label: "Accepted IDs", prompt: "What valid IDs are accepted for verification?" });
    actions.push({ label: "Viewing Schedule", prompt: "How can I schedule an in-person room viewing?" });
    return actions.slice(0, 4);
  }

  // Billing links
  if (
    text.includes("bill") ||
    text.includes("bayad") ||
    text.includes("electric") ||
    text.includes("kuryente") ||
    text.includes("penalty") ||
    text.includes("penalties") ||
    text.includes("late fee") ||
    text.includes("multa") ||
    text.includes("surcharge")
  ) {
    actions.push({ label: "View Billing Statement", url: "/applicant/billing" });
    actions.push({ label: "Check Electricity Share", prompt: "How was my electricity share computed this month?" });
  }

  // Contract & Lease links
  if (text.includes("contract") || text.includes("lease") || text.includes("renew") || text.includes("deposit") || text.includes("expire")) {
    actions.push({ label: "View My Contract", url: "/applicant/contracts" });
    actions.push({ label: "Lease Renewal Steps", prompt: "How do I request a lease renewal?" });
  }

  // Maintenance links
  if (text.includes("maintenance") || text.includes("repair") || text.includes("sira") || text.includes("ticket") || text.includes("technician")) {
    actions.push({ label: "Maintenance Portal", url: "/applicant/maintenance" });
    actions.push({ label: "Submit New Request", prompt: "How can I report a broken facility in my room?" });
  }

  // Default quick actions
  if (actions.length === 0) {
    actions.push({ label: "View My Bills", url: "/applicant/billing" });
    actions.push({ label: "View Contract", url: "/applicant/contracts" });
    actions.push({ label: "Request Maintenance", url: "/applicant/maintenance" });
  }

  // Escalation action
  actions.push({ label: "Chat with Admin", action: "open_escalate_modal" });

  // Deduplicate
  const uniqueActions = [];
  const seen = new Set();
  for (const act of actions) {
    if (!seen.has(act.label)) {
      seen.add(act.label);
      uniqueActions.push(act);
    }
  }

  return uniqueActions.slice(0, 4);
}

/**
 * Generates accurate rule-based fallback responses grounded on the tenant context.
 */
export function getTenantRuleBasedFallback(message = "", context = null) {
  const rawText = (message || "").trim();
  const text = rawText.toLowerCase();

  const user = context?.user;
  const contract = context?.contract;
  const bill = context?.bill;
  const maintenance = context?.maintenance || [];

  // 1. Billing & Electricity Inquiries
  if (text.includes("electric") || text.includes("kuryente") || text.includes("meter")) {
    if (bill) {
      const elecFormatted = `₱${Number(bill.electricityAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
      return `Hello! Your submetered electricity share for the current period is **${elecFormatted}**. This is computed by dividing your room's actual submeter usage equally among roommates on the 15th of each month. Water and high-speed Wi-Fi are 100% free and included in your rent! You can review full details on your [Billing Page](/applicant/billing).`;
    }
    return "Your room electricity is measured monthly with a dedicated submeter on the 15th and shared equally among roommates. Water and high-speed Wi-Fi are completely free and included in your rent.";
  }

  if (
    text.includes("bill") ||
    text.includes("bayad") ||
    text.includes("rent") ||
    text.includes("due date") ||
    text.includes("magkano") ||
    text.includes("next bill") ||
    text.includes("penalty") ||
    text.includes("penalties") ||
    text.includes("late fee") ||
    text.includes("multa") ||
    text.includes("surcharge")
  ) {
    const isPaid = !bill || bill.status === "paid" || Number(bill.remainingAmount ?? bill.totalAmount ?? 0) <= 0;
    if (isPaid) {
      const leaseDueCycle = context?.leaseCycleText || (contract?.leaseStartDate ? `the ${contract.leaseStartDate}` : "your monthly lease cycle");
      return `Your current bill has already been paid, and there are no pending balances at the moment. Your recurring monthly rent follows your lease start cycle (${leaseDueCycle}), while submetered electricity is read and calculated on the 15th of each month. You can review your payment history anytime in your [Billing Page](/applicant/billing).`;
    }
    const totalFormatted = `₱${Number(bill.remainingAmount !== undefined ? bill.remainingAmount : bill.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
    const dueFormatted = bill.dueDate || context?.leaseCycleText || "your scheduled lease due date";
    return `Hello! Your total outstanding balance is **${totalFormatted}**, due on **${dueFormatted}** (Status: ${bill.status.toUpperCase()}). You can easily settle this online via GCash or bank transfer on your [Billing Page](/applicant/billing).`;
  }

  // 2. Contract & Lease Inquiries
  if (text.includes("contract") || text.includes("lease") || text.includes("expire") || text.includes("matapos") || text.includes("renew") || text.includes("deposit") || text.includes("clearance") || text.includes("move out") || text.includes("move-out")) {
    if (contract) {
      const endFormatted = contract.leaseEndDate || "N/A";
      const daysEn = contract.daysRemaining !== null ? `${contract.daysRemaining} days` : "N/A";
      return `Your lease for Room **${contract.roomNumber}** (${contract.bedLabel}) ends on **${endFormatted}** (${daysEn} remaining). If you'd like to extend your stay, you can request a lease renewal directly from your [Contracts Page](/applicant/contracts). For move-outs, your security deposit is fully refundable upon completing a quick room clearance check.`;
    }
  }

  // 3. Maintenance Inquiries
  if (text.includes("maintenance") || text.includes("repair") || text.includes("sira") || text.includes("ticket") || text.includes("ayos")) {
    if (maintenance.length > 0) {
      const latest = maintenance[0];
      return `You have an active repair request: **${latest.ticketNumber}** (${latest.issueTitle}) with status **${latest.status.toUpperCase()}**. Our on-site technicians attend to repairs within 24-48 hours. You can follow updates on your [Maintenance Page](/applicant/maintenance).`;
    }
    return "You currently have no pending maintenance tickets! If anything in your room needs repair (such as plumbing, lighting, or air conditioning), feel free to submit a request on your [Maintenance Page](/applicant/maintenance) and our team will attend to it promptly.";
  }

  // Default Greeting / Help
  return "Hello! I am your Lilycrest Tenant Assistant, here to help make your stay smooth and comfortable. Feel free to ask about your monthly bill, electricity share, lease timeline, or maintenance requests.";
}

/**
 * Streams LLM response with real-time SSE token delivery grounded on tenant stay context.
 */
export async function streamTenantAssistant({
  userId,
  message,
  conversationHistory = [],
  onToken,
  onWidget,
  onActions,
  onDone,
  onError,
  signal,
}) {
  const trimmedMessage = (message || "").trim();
  const context = await getTenantStayContext(userId);

  // 1. Emit widget if detected
  const widget = detectTenantWidgetIntent(trimmedMessage, context);
  if (widget && typeof onWidget === "function") {
    try {
      onWidget(widget);
    } catch {
      // Non-fatal
    }
  }

  const systemPrompt = buildTenantSystemPrompt(context);
  const messages = buildStandardMessages(systemPrompt, trimmedMessage, conversationHistory);

  try {
    const fullReply = await streamChatCompletion({
      messages,
      onToken,
      signal,
    });

    const actions = determineTenantSuggestedActions(trimmedMessage, fullReply, context);
    onActions?.(actions);
    onDone?.({
      fullReply,
      widget,
      suggestedActions: actions,
      canEscalate: true,
    });
  } catch (err) {
    if (signal?.aborted) return;

    if (process.env.NODE_ENV !== "production") {
      console.warn("[TenantAssistant] Streaming failed, using rule-based fallback:", err?.message);
    }

    // Fallback to grounded rule-based streaming
    const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, context);
    await simulateStream(fallbackReply, { onToken, signal });
    const actions = determineTenantSuggestedActions(trimmedMessage, fallbackReply, context);
    onActions?.(actions);
    onDone?.({
      fullReply: fallbackReply,
      widget,
      suggestedActions: actions,
      canEscalate: true,
    });
  }
}

/**
 * Standard REST query handler for tenant assistant.
 */
export async function queryTenantAssistantService({ userId, message, conversationHistory = [] }) {
  const trimmedMessage = (message || "").trim();
  const context = await getTenantStayContext(userId);
  const widget = detectTenantWidgetIntent(trimmedMessage, context);
  const systemPrompt = buildTenantSystemPrompt(context);
  const messages = buildStandardMessages(systemPrompt, trimmedMessage, conversationHistory);

  try {
    const reply = await generateChatCompletion({
      messages,
      temperature: 0.65,
    });

    if (reply) {
      return {
        reply,
        widget,
        suggestedActions: determineTenantSuggestedActions(trimmedMessage, reply, context),
        canEscalate: true,
      };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[TenantAssistant] Query failed, using rule-based fallback:", err?.message);
    }
  }

  const fallbackReply = getTenantRuleBasedFallback(trimmedMessage, context);
  return {
    reply: fallbackReply,
    widget,
    suggestedActions: determineTenantSuggestedActions(trimmedMessage, fallbackReply, context),
    canEscalate: true,
  };
}

/**
 * Escalate tenant assistant conversation to the branch admin team.
 */
export async function escalateTenantAssistantService({ userId, category, priority = "medium", summary, lastBotMessage }) {
  const context = await getTenantStayContext(userId);
  const user = context?.user;

  const inquiry = new Inquiry({
    fullName: user?.name || "Tenant",
    email: user?.email || "tenant@lilycrest.com",
    contactNumber: user?.phone || "09000000000",
    preferredBranch: context?.contract?.branch || user?.branch || "guadalupe",
    preferredRoomType: context?.contract?.roomType || "Shared",
    message: `[TENANT ASSISTANT ESCALATION - ${category || "General Inquiry"}]\nTenant: ${user?.name} (Room ${context?.contract?.roomNumber || "N/A"})\nPriority: ${priority}\nSummary: ${summary}\n\nLast Assistant Response: ${lastBotMessage || "N/A"}`,
    source: "website",
    sourceNote: "tenant_ai_assistant_escalation",
    viewingStatus: "new",
    priority: priority === "high" || priority === "urgent" ? "high" : "medium",
  });

  await inquiry.save();

  return {
    escalationId: String(inquiry._id),
    message: "Your inquiry has been escalated directly to our Branch Admin team. We will attend to your concern promptly.",
  };
}

async function simulateStream(text, { onToken, signal }) {
  if (!text) return;
  const words = text.match(/\S+|\s+/g) || [text];
  const delay = process.env.NODE_ENV === "test" ? 0 : 12;
  for (const token of words) {
    if (signal?.aborted) break;
    onToken?.(token);
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
