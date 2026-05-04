const CHATBOT_SYSTEM_PROMPT = [
  "You are Lily, the LilyCrest tenant support assistant.",
  "Answer in clear, friendly tenant-facing language.",
  "Use available tenant context and policy hints when provided.",
  "If a request needs staff action, explain that an admin will follow up.",
].join(" ");

const KNOWLEDGE_BASE = {
  billing: {
    intent: "billing",
    triggers: ["bill", "billing", "payment", "paid", "receipt", "balance", "rent"],
    knowledge:
      "Tenants can review bills, balances, receipts, and payment status in the billing section.",
    followups: ["Check my balance", "View payment status", "Ask about receipts"],
    escalation_if: ["wrong charge", "overcharged", "double payment", "refund"],
  },
  maintenance: {
    intent: "maintenance",
    triggers: ["maintenance", "repair", "broken", "leak", "issue", "fix"],
    knowledge:
      "Maintenance concerns should include the room, issue details, urgency, and photos when available.",
    followups: ["Create maintenance request", "Check request status", "Add more details"],
    escalation_if: ["emergency", "flood", "fire", "danger", "unsafe"],
  },
  reservation: {
    intent: "reservation",
    triggers: ["reservation", "reserve", "visit", "room", "bed", "availability"],
    knowledge:
      "Reservation and visit details depend on room availability, submitted requirements, and admin confirmation.",
    followups: ["Check reservation status", "Ask about visits", "Ask about available rooms"],
  },
  account: {
    intent: "account",
    triggers: ["account", "login", "password", "email", "profile", "otp"],
    knowledge:
      "Account concerns may require identity verification before staff can change sensitive information.",
    followups: ["Reset password", "Update profile", "Contact admin"],
    escalation_if: ["blocked", "locked", "can't login", "cannot login"],
  },
};

const ESCALATION_KEYWORDS = [
  "admin",
  "human",
  "staff",
  "urgent",
  "emergency",
  "unsafe",
  "complaint",
  "refund",
  "blocked",
];

const DEFAULT_FOLLOWUPS = [
  "Check my account",
  "Ask about billing",
  "Talk to an admin",
];

function isGreeting(message = "") {
  return /^(hi|hello|hey|good morning|good afternoon|good evening)\b/i.test(message.trim());
}

function getTimeOfDayGreeting() {
  const hour = new Date().toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hour12: false,
  });
  const numericHour = Number(hour);
  if (numericHour < 12) return "Good morning!";
  if (numericHour < 18) return "Good afternoon!";
  return "Good evening!";
}

function detectEmotionalTone(message = "") {
  return /(angry|upset|frustrated|annoyed|unfair|bad service|disappointed|stress)/i.test(
    message,
  );
}

module.exports = {
  CHATBOT_SYSTEM_PROMPT,
  KNOWLEDGE_BASE,
  ESCALATION_KEYWORDS,
  DEFAULT_FOLLOWUPS,
  isGreeting,
  getTimeOfDayGreeting,
  detectEmotionalTone,
};
