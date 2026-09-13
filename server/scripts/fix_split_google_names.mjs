import { fileURLToPath } from "node:url";

const COMPOUND_PREFIXES = new Set([
  "dela", "delos", "del", "de", "san", "santa", "van", "von", "da", "di"
]);

const SUFFIXES = new Set([
  "jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v", "vi"
]);

function formatProperCase(str) {
  if (!str) return "";
  return String(str).replace(/(?:^|[\s'.-])([a-zA-Z])/g, (char) => char.toUpperCase());
}

/**
 * Computes repaired firstName and lastName from an affected user record.
 */
export function computeRepairedName(user) {
  if (!user?.firstName || !user?.lastName) {
    return { firstName: user?.firstName || "", lastName: user?.lastName || "" };
  }

  let rawFirst = user.firstName.trim();
  let rawLast = user.lastName.trim();

  // If firstName was saved as "Ma" without period, restore "Ma."
  if (rawFirst.toLowerCase() === "ma") {
    rawFirst = "Ma.";
  }

  const combined = `${rawFirst} ${rawLast}`.replace(/\s+/g, " ").trim();
  const tokens = combined.split(" ");

  if (tokens.length <= 2) {
    return { firstName: rawFirst, lastName: rawLast };
  }

  let suffix = "";
  if (tokens.length >= 3 && SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) {
    suffix = tokens.pop();
  }

  let firstNameTokens = [];
  let lastNameTokens = [];

  // Check two-word prefixes like "de los", "de la"
  if (tokens.length >= 4) {
    const secondPrev = tokens[tokens.length - 3].toLowerCase();
    const firstPrev = tokens[tokens.length - 2].toLowerCase();
    if (secondPrev === "de" && (firstPrev === "los" || firstPrev === "la")) {
      lastNameTokens = tokens.slice(-3);
      firstNameTokens = tokens.slice(0, -3);
    }
  }

  // Check single-word compound prefixes like "dela", "del", "de"
  if (lastNameTokens.length === 0 && tokens.length >= 3) {
    const prevLower = tokens[tokens.length - 2].toLowerCase();
    if (COMPOUND_PREFIXES.has(prevLower)) {
      lastNameTokens = tokens.slice(-2);
      firstNameTokens = tokens.slice(0, -2);
    }
  }

  if (lastNameTokens.length === 0) {
    lastNameTokens = [tokens[tokens.length - 1]];
    firstNameTokens = tokens.slice(0, -1);
  }

  let firstName = firstNameTokens.map(formatProperCase).join(" ");
  let lastName = lastNameTokens.map(formatProperCase).join(" ");

  if (suffix) {
    lastName = `${lastName} ${formatProperCase(suffix)}`.trim();
  }

  return { firstName, lastName };
}

/**
 * Determines whether a user record needs name repair.
 */
export function shouldRepairUser(user) {
  if (!user?.firstName || !user?.lastName) return false;
  
  const lastParts = user.lastName.trim().split(/\s+/).filter(Boolean);
  if (lastParts.length < 2) return false;

  const repaired = computeRepairedName(user);
  return repaired.firstName !== user.firstName || repaired.lastName !== user.lastName;
}

// ─── CLI EXECUTION (supports --dry-run and --execute) ─────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log("Lilycrest DMS: Google Name Repair CLI");
  const isExecute = process.argv.includes("--execute");
  console.log(`Mode: ${isExecute ? "EXECUTE (mutations will be saved)" : "DRY-RUN (read-only preview)"}`);
}
